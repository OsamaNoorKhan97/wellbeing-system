import { db, withTransaction, type Db } from '../../db/pool';
import type { AuthUser, Role } from '../../middleware/authenticate';
import { recordAudit } from '../../services/audit.service';
import { badRequest, conflict, notFound, offsetOf } from '../../utils/http';
import { hashPassword } from '../../utils/password';
import { cancelMeetingsForUser } from '../meetings/meetings.service';

const USER_FROM = `
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN employee_profiles ep ON ep.user_id = u.id
    LEFT JOIN line_manager_profiles mp ON mp.user_id = u.id
    LEFT JOIN employee_manager_assignments a ON a.employee_id = u.id AND a.is_active
    LEFT JOIN users m ON m.id = a.manager_id`;

export const USER_SELECT = `
  SELECT u.id, u.full_name AS "fullName", u.email, u.employee_code AS "employeeId", r.name AS role,
         u.is_active AS "isActive", u.last_login_at AS "lastLoginAt", u.created_at AS "createdAt",
         CASE r.name WHEN 'EMPLOYEE' THEN ep.department WHEN 'LINE_MANAGER' THEN mp.department END AS department,
         CASE r.name WHEN 'EMPLOYEE' THEN ep.designation WHEN 'LINE_MANAGER' THEN mp.designation END AS designation,
         m.id AS "managerId", m.full_name AS "managerName",
         (SELECT count(*)::int FROM employee_manager_assignments t WHERE t.manager_id = u.id AND t.is_active) AS "teamSize"
    ${USER_FROM}`;

export async function findUserById(id: number, tx: Db = db) {
  const { rows } = await tx.query(`${USER_SELECT} WHERE u.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function assertUniqueIdentity(tx: Db, email: string, employeeCode: string): Promise<void> {
  const { rows } = await tx.query('SELECT email, employee_code FROM users WHERE email = $1 OR employee_code = $2', [email, employeeCode]);
  if (rows.length === 0) return;
  const details = [];
  if (rows.some((r) => r.email === email)) details.push({ field: 'email', message: 'This email address is already registered' });
  if (rows.some((r) => r.employee_code === employeeCode)) details.push({ field: 'employeeId', message: 'This Employee ID is already registered' });
  throw conflict('DUPLICATE_USER', 'An account with these details already exists', details);
}

export interface NewUser {
  fullName: string;
  employeeId: string;
  email: string;
  password: string;
  role: Role;
  department?: string;
  designation?: string;
}

export async function insertUser(tx: Db, input: NewUser): Promise<number> {
  const email = input.email.toLowerCase();
  const employeeCode = input.employeeId.toUpperCase();
  await assertUniqueIdentity(tx, email, employeeCode);
  const passwordHash = await hashPassword(input.password);
  const { rows } = await tx.query(
    `INSERT INTO users (role_id, full_name, email, employee_code, password_hash)
     VALUES ((SELECT id FROM roles WHERE name = $1), $2, $3, $4, $5) RETURNING id`,
    [input.role, input.fullName, email, employeeCode, passwordHash],
  );
  const userId: number = rows[0].id;
  await upsertProfile(tx, userId, input.role, input.department, input.designation);
  return userId;
}

async function upsertProfile(tx: Db, userId: number, role: Role, department?: string | null, designation?: string | null) {
  const table = role === 'EMPLOYEE' ? 'employee_profiles' : role === 'LINE_MANAGER' ? 'line_manager_profiles' : null;
  if (!table) return;
  await tx.query(
    `INSERT INTO ${table} (user_id, department, designation) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET department = EXCLUDED.department, designation = EXCLUDED.designation`,
    [userId, department || 'Unassigned', designation || (role === 'LINE_MANAGER' ? 'Line Manager' : 'Employee')],
  );
}

export interface UserListQuery {
  page: number;
  pageSize: number;
  search?: string;
  role?: Role;
  status?: 'active' | 'inactive';
  department?: string;
  assignment?: 'assigned' | 'unassigned';
}

export async function listUsers(query: UserListQuery) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (query.search) {
    params.push(`%${query.search}%`);
    const p = `$${params.length}`;
    where.push(`(u.full_name ILIKE ${p} OR u.email ILIKE ${p} OR u.employee_code ILIKE ${p})`);
  }
  if (query.role) {
    params.push(query.role);
    where.push(`r.name = $${params.length}`);
  }
  if (query.status) where.push(query.status === 'active' ? 'u.is_active' : 'NOT u.is_active');
  if (query.department) {
    params.push(query.department);
    where.push(`COALESCE(ep.department, mp.department) = $${params.length}`);
  }
  if (query.assignment) where.push(query.assignment === 'assigned' ? 'a.id IS NOT NULL' : 'a.id IS NULL');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = await db.query(`SELECT count(*)::int AS total ${USER_FROM} ${whereSql}`, params);
  const { rows } = await db.query(
    `${USER_SELECT} ${whereSql} ORDER BY u.full_name, u.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, query.pageSize, offsetOf(query.page, query.pageSize)],
  );
  return { items: rows, total: total.rows[0].total as number };
}

/** Administrative detail view: activity counts only, never individual well-being scores or survey answers. */
export async function getUserDetail(id: number) {
  const user = await findUserById(id);
  if (!user) throw notFound('User');
  const { rows } = await db.query(
    `SELECT (SELECT count(*)::int FROM wellbeing_assessments WHERE employee_id = $1) AS "assessmentCount",
            (SELECT max(submitted_at) FROM wellbeing_assessments WHERE employee_id = $1) AS "lastAssessmentAt",
            (SELECT count(*)::int FROM survey_submissions WHERE employee_id = $1) AS "surveyCount",
            (SELECT max(submitted_at) FROM survey_submissions WHERE employee_id = $1) AS "lastSurveyAt",
            (SELECT count(*)::int FROM support_requests WHERE employee_id = $1) AS "requestCount",
            (SELECT count(*)::int FROM support_requests WHERE employee_id = $1 AND status = 'PENDING') AS "pendingRequestCount"`,
    [id],
  );
  return { ...user, activity: rows[0] };
}

export async function createUser(actor: AuthUser, input: NewUser, ip: string | null) {
  return withTransaction(async (tx) => {
    const userId = await insertUser(tx, input);
    await recordAudit(tx, { actorId: actor.id, action: 'USER_CREATED', entityType: 'user', entityId: userId, details: { role: input.role }, ip });
    return findUserById(userId, tx);
  });
}

export async function setUserStatus(actor: AuthUser, userId: number, isActive: boolean, ip: string | null) {
  if (actor.id === userId) throw badRequest('You cannot change the status of your own account');
  return withTransaction(async (tx) => {
    const { rows } = await tx.query('UPDATE users SET is_active = $2 WHERE id = $1 RETURNING id', [userId, isActive]);
    if (rows.length === 0) throw notFound('User');
    await recordAudit(tx, {
      actorId: actor.id,
      action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      entityType: 'user',
      entityId: userId,
      ip,
    });
    return findUserById(userId, tx);
  });
}

export async function setUserRole(actor: AuthUser, userId: number, role: Role, ip: string | null) {
  if (actor.id === userId) throw badRequest('You cannot change your own role');
  return withTransaction(async (tx) => {
    const user = await findUserById(userId, tx);
    if (!user) throw notFound('User');
    if (user.role === role) return user;

    await tx.query('UPDATE users SET role_id = (SELECT id FROM roles WHERE name = $2) WHERE id = $1', [userId, role]);
    await upsertProfile(tx, userId, role, user.department, user.designation);

    // The old reporting lines no longer make sense under the new role.
    await tx.query(
      `UPDATE employee_manager_assignments SET is_active = false, ended_at = now()
        WHERE is_active AND (employee_id = $1 OR manager_id = $1)`,
      [userId],
    );
    await cancelMeetingsForUser(tx, userId, actor.id, 'Reporting line changed');

    await recordAudit(tx, {
      actorId: actor.id,
      action: 'USER_ROLE_CHANGED',
      entityType: 'user',
      entityId: userId,
      details: { from: user.role, to: role },
      ip,
    });
    return findUserById(userId, tx);
  });
}

export async function listDepartments(): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT DISTINCT department FROM (
       SELECT department FROM employee_profiles UNION SELECT department FROM line_manager_profiles
     ) d ORDER BY department`,
  );
  return rows.map((r) => r.department);
}
