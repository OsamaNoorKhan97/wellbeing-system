import { db, withTransaction } from '../../db/pool';
import type { AuthUser } from '../../middleware/authenticate';
import { recordAudit } from '../../services/audit.service';
import { notify } from '../../services/notification.service';
import { badRequest, notFound } from '../../utils/http';
import { findUserById } from '../users/users.service';

/** Managers with their current team members, for the assignment overview. */
export async function listAssignmentsByManager() {
  const { rows } = await db.query(
    `SELECT m.id, m.full_name AS "fullName", m.employee_code AS "employeeId", m.is_active AS "isActive",
            mp.department, mp.designation,
            COALESCE(json_agg(json_build_object(
              'id', e.id, 'fullName', e.full_name, 'employeeId', e.employee_code,
              'department', ep.department, 'designation', ep.designation, 'assignedAt', a.assigned_at
            ) ORDER BY e.full_name) FILTER (WHERE e.id IS NOT NULL), '[]'::json) AS team
       FROM users m
       JOIN roles r ON r.id = m.role_id AND r.name = 'LINE_MANAGER'
       LEFT JOIN line_manager_profiles mp ON mp.user_id = m.id
       LEFT JOIN employee_manager_assignments a ON a.manager_id = m.id AND a.is_active
       LEFT JOIN users e ON e.id = a.employee_id
       LEFT JOIN employee_profiles ep ON ep.user_id = e.id
      GROUP BY m.id, mp.department, mp.designation
      ORDER BY m.full_name`,
  );
  return rows;
}

export async function assignManager(actor: AuthUser, employeeId: number, managerId: number, ip: string | null) {
  return withTransaction(async (tx) => {
    const employee = await findUserById(employeeId, tx);
    const manager = await findUserById(managerId, tx);
    if (!employee || employee.role !== 'EMPLOYEE') throw notFound('Employee');
    if (!manager || manager.role !== 'LINE_MANAGER') throw notFound('Line Manager');
    if (!manager.isActive) throw badRequest('This Line Manager account is deactivated');
    if (employee.managerId === managerId) return employee;

    await tx.query('UPDATE employee_manager_assignments SET is_active = false, ended_at = now() WHERE employee_id = $1 AND is_active', [employeeId]);
    await tx.query('INSERT INTO employee_manager_assignments (employee_id, manager_id, assigned_by) VALUES ($1, $2, $3)', [
      employeeId,
      managerId,
      actor.id,
    ]);
    // Requests still waiting for a decision follow the employee to the new manager.
    await tx.query(`UPDATE support_requests SET manager_id = $2 WHERE employee_id = $1 AND status = 'PENDING'`, [employeeId, managerId]);

    await notify(tx, {
      recipientId: employeeId,
      relatedUserId: managerId,
      type: 'MANAGER_ASSIGNED',
      title: 'Line Manager assigned',
      message: `${manager.fullName} is now your Line Manager.`,
      entityType: 'assignment',
    });
    await notify(tx, {
      recipientId: managerId,
      relatedUserId: employeeId,
      type: 'TEAM_MEMBER_ASSIGNED',
      title: 'New team member',
      message: `${employee.fullName} has been assigned to your team.`,
      entityType: 'assignment',
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: 'MANAGER_ASSIGNED',
      entityType: 'user',
      entityId: employeeId,
      details: { managerId, previousManagerId: employee.managerId },
      ip,
    });
    return findUserById(employeeId, tx);
  });
}

export async function removeAssignment(actor: AuthUser, employeeId: number, ip: string | null) {
  return withTransaction(async (tx) => {
    const { rows } = await tx.query(
      `UPDATE employee_manager_assignments SET is_active = false, ended_at = now()
        WHERE employee_id = $1 AND is_active RETURNING manager_id`,
      [employeeId],
    );
    if (rows.length === 0) throw notFound('Active assignment');
    await recordAudit(tx, {
      actorId: actor.id,
      action: 'MANAGER_UNASSIGNED',
      entityType: 'user',
      entityId: employeeId,
      details: { previousManagerId: rows[0].manager_id },
      ip,
    });
    return findUserById(employeeId, tx);
  });
}
