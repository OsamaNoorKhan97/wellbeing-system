import { db, withTransaction, type Db } from '../../db/pool';
import type { AuthUser } from '../../middleware/authenticate';
import { getActiveManager } from '../../services/assignment.service';
import { recordAudit } from '../../services/audit.service';
import { notify } from '../../services/notification.service';
import { getSettings, type AppSettings } from '../../services/settings.service';
import { formatMeetingTime } from '../../utils/dates';
import { conflict, notFound, offsetOf } from '../../utils/http';

export interface Ratings {
  mood: number;
  stress: number;
  energy: number;
}

/** An assessment is poor when enough of the three indicators cross their thresholds (all values come from the settings table). */
export function poorIndicatorCount(ratings: Ratings, s: AppSettings): number {
  return (
    (ratings.mood <= s.alertMoodThreshold ? 1 : 0) +
    (ratings.stress >= s.alertStressThreshold ? 1 : 0) +
    (ratings.energy <= s.alertEnergyThreshold ? 1 : 0)
  );
}

export const isPoorAssessment = (ratings: Ratings, s: AppSettings) => poorIndicatorCount(ratings, s) >= s.alertIndicatorsRequired;

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export const ALERT_MESSAGE =
  'An employee has submitted two consecutive well-being assessments indicating potentially poor well-being. Please review the alert and consider providing appropriate support.';

function alertMessage(count: number): string {
  return ALERT_MESSAGE.replace('two consecutive', `${NUMBER_WORDS[count] ?? count} consecutive`);
}

/**
 * Called inside the transaction that stores a new assessment (the employee's advisory lock is held),
 * so two simultaneous submissions cannot raise the same alert twice. Returns the new alert id, if any.
 */
export async function evaluateAlertAfterAssessment(tx: Db, employee: AuthUser): Promise<number | null> {
  const settings = await getSettings(tx);
  const needed = settings.alertConsecutiveRequired;

  // Only real assessments are looked at: a skipped day is simply absent and is never counted as poor.
  const recent = await tx.query(
    `SELECT id, mood_rating AS mood, stress_rating AS stress, energy_rating AS energy, submitted_at AS "submittedAt"
       FROM wellbeing_assessments WHERE employee_id = $1 ORDER BY submitted_at DESC, id DESC LIMIT $2`,
    [employee.id, needed],
  );
  if (recent.rows.length < needed) return null;
  if (!recent.rows.every((row) => isPoorAssessment(row, settings))) return null;

  // No second alert while one is still open, and a sequence can only be used once: the new run of
  // poor assessments must all be newer than the last alert's final assessment.
  const previous = await tx.query(
    `SELECT status, last_assessment_id AS "lastAssessmentId" FROM wellbeing_alerts WHERE employee_id = $1 ORDER BY triggered_at DESC, id DESC LIMIT 1`,
    [employee.id],
  );
  const last = previous.rows[0];
  if (last && (last.status !== 'RESOLVED' || recent.rows.some((row) => row.id <= last.lastAssessmentId))) return null;

  const manager = await getActiveManager(employee.id, tx);
  const sequence = [...recent.rows].reverse(); // oldest first
  const inserted = await tx.query(
    `INSERT INTO wellbeing_alerts (employee_id, manager_id, assessment_ids, last_assessment_id)
     VALUES ($1, $2, $3, $4) ON CONFLICT (employee_id, last_assessment_id) DO NOTHING RETURNING id, triggered_at AS "triggeredAt"`,
    [employee.id, manager?.id ?? null, sequence.map((r) => r.id), sequence[sequence.length - 1].id],
  );
  if (inserted.rows.length === 0) return null;
  const alertId: number = inserted.rows[0].id;

  const profile = await tx.query('SELECT employee_code, (SELECT department FROM employee_profiles WHERE user_id = $1) AS department FROM users WHERE id = $1', [
    employee.id,
  ]);
  const { timezone } = settings;
  const day = (d: Date) => formatMeetingTime(d, timezone).date;
  const message = [
    alertMessage(needed),
    `Employee: ${employee.fullName}`,
    `Employee ID: ${profile.rows[0].employee_code}`,
    `Department: ${profile.rows[0].department ?? 'Not set'}`,
    'Alert type: Consecutive poor well-being assessments',
    `Assessments: ${sequence.map((r) => day(r.submittedAt)).join(', ')}`,
    `Alert created: ${day(inserted.rows[0].triggeredAt)}`,
  ].join(' · ');

  const recipients = new Set<number>();
  if (settings.alertNotifyLineManager && manager) recipients.add(manager.id);
  if (settings.alertNotifyHr) {
    const hr = await tx.query(`SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'HR' AND u.is_active`);
    for (const row of hr.rows) recipients.add(row.id);
  }
  for (const recipientId of recipients) {
    await notify(tx, {
      recipientId,
      relatedUserId: employee.id,
      type: 'WELLBEING_ALERT',
      title: 'Employee well-being alert',
      message,
      entityType: 'wellbeing_alert',
      entityId: alertId,
    });
  }
  await recordAudit(tx, {
    actorId: employee.id,
    action: 'WELLBEING_ALERT_TRIGGERED',
    entityType: 'wellbeing_alert',
    entityId: alertId,
    details: { assessmentIds: sequence.map((r) => r.id), notified: recipients.size },
  });
  return alertId;
}

// ------------------------------------------------------------------ reading alerts

const TEAM_SCOPE = `a.employee_id IN (SELECT employee_id FROM employee_manager_assignments WHERE manager_id = $1 AND is_active)`;

const ALERT_SELECT = `
  SELECT a.id, a.status, a.alert_type AS "alertType", a.triggered_at AS "triggeredAt",
         a.acknowledged_at AS "acknowledgedAt", a.resolved_at AS "resolvedAt",
         e.id AS "employeeId", e.full_name AS "employeeName", e.employee_code AS "employeeCode",
         ep.department AS "department",
         m.id AS "managerId", m.full_name AS "managerName",
         ab.full_name AS "acknowledgedByName", rb.full_name AS "resolvedByName",
         cardinality(a.assessment_ids) AS "assessmentCount",
         (SELECT json_agg(w.submitted_at ORDER BY w.submitted_at) FROM wellbeing_assessments w WHERE w.id = ANY(a.assessment_ids)) AS "assessmentDates",
         (SELECT count(*)::int FROM wellbeing_alert_comments c WHERE c.alert_id = a.id) AS "commentCount",
         (SELECT json_build_object('id', sr.id, 'status', sr.status)
            FROM support_requests sr WHERE sr.alert_id = a.id AND sr.type = 'BREAK' ORDER BY sr.created_at DESC LIMIT 1) AS "breakRequest"
    FROM wellbeing_alerts a
    JOIN users e ON e.id = a.employee_id
    LEFT JOIN employee_profiles ep ON ep.user_id = e.id
    LEFT JOIN users m ON m.id = a.manager_id
    LEFT JOIN users ab ON ab.id = a.acknowledged_by
    LEFT JOIN users rb ON rb.id = a.resolved_by`;

export type AlertFilter = 'open' | 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'all';

export interface AlertListQuery {
  page: number;
  pageSize: number;
  status: AlertFilter;
}

function scopeFor(user: AuthUser): { sql: string; params: unknown[] } {
  // A Line Manager only ever sees the alerts of employees currently assigned to them; HR and Super Admin see all.
  return user.role === 'LINE_MANAGER' ? { sql: TEAM_SCOPE, params: [user.id] } : { sql: 'true', params: [] };
}

export async function listAlerts(user: AuthUser, query: AlertListQuery) {
  const scope = scopeFor(user);
  const params = [...scope.params];
  const where = [scope.sql];
  if (query.status === 'open') where.push(`a.status <> 'RESOLVED'`);
  else if (query.status !== 'all') {
    params.push(query.status);
    where.push(`a.status = $${params.length}`);
  }
  const whereSql = where.join(' AND ');
  const total = await db.query(`SELECT count(*)::int AS total FROM wellbeing_alerts a WHERE ${whereSql}`, params);
  const { rows } = await db.query(
    `${ALERT_SELECT} WHERE ${whereSql}
      ORDER BY (a.status = 'ACTIVE') DESC, (a.status = 'ACKNOWLEDGED') DESC, a.triggered_at DESC, a.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, query.pageSize, offsetOf(query.page, query.pageSize)],
  );
  return { items: rows, total: total.rows[0].total as number };
}

export async function countOpenAlerts(user: AuthUser): Promise<number> {
  const scope = scopeFor(user);
  const { rows } = await db.query(`SELECT count(*)::int AS total FROM wellbeing_alerts a WHERE ${scope.sql} AND a.status <> 'RESOLVED'`, scope.params);
  return rows[0].total;
}

export async function getAlert(user: AuthUser, id: number) {
  const scope = scopeFor(user);
  const params = [...scope.params, id];
  const { rows } = await db.query(`${ALERT_SELECT} WHERE ${scope.sql} AND a.id = $${params.length}`, params);
  if (rows.length === 0) throw notFound('Alert');
  const comments = await db.query(
    `SELECT c.id, c.comment, c.created_at AS "createdAt", u.id AS "authorId", u.full_name AS "authorName", r.name AS "authorRole"
       FROM wellbeing_alert_comments c
       LEFT JOIN users u ON u.id = c.author_id
       LEFT JOIN roles r ON r.id = u.role_id
      WHERE c.alert_id = $1 ORDER BY c.created_at, c.id`,
    [id],
  );
  return { ...rows[0], comments: comments.rows };
}

// ------------------------------------------------------------------ acting on alerts

/** Locks the alert row after checking that this user may see it, so two people cannot acknowledge/resolve at once. */
async function lockAlert(tx: Db, user: AuthUser, id: number) {
  const scope = scopeFor(user);
  const params = [...scope.params, id];
  const { rows } = await tx.query(
    `SELECT a.id, a.status FROM wellbeing_alerts a WHERE ${scope.sql} AND a.id = $${params.length} FOR UPDATE OF a`,
    params,
  );
  if (rows.length === 0) throw notFound('Alert');
  return rows[0] as { id: number; status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' };
}

async function addComment(tx: Db, alertId: number, authorId: number, comment: string) {
  await tx.query('INSERT INTO wellbeing_alert_comments (alert_id, author_id, comment) VALUES ($1, $2, $3)', [alertId, authorId, comment]);
}

export async function acknowledgeAlert(user: AuthUser, id: number, comment: string | null, ip: string | null) {
  await withTransaction(async (tx) => {
    const alert = await lockAlert(tx, user, id);
    if (alert.status !== 'ACTIVE') throw conflict('ALERT_NOT_ACTIVE', 'This alert has already been acknowledged or resolved.');
    await tx.query(`UPDATE wellbeing_alerts SET status = 'ACKNOWLEDGED', acknowledged_by = $2, acknowledged_at = now() WHERE id = $1`, [id, user.id]);
    if (comment) await addComment(tx, id, user.id, comment);
    await recordAudit(tx, { actorId: user.id, action: 'WELLBEING_ALERT_ACKNOWLEDGED', entityType: 'wellbeing_alert', entityId: id, ip });
  });
  return getAlert(user, id);
}

export async function resolveAlert(user: AuthUser, id: number, comment: string | null, ip: string | null) {
  await withTransaction(async (tx) => {
    const alert = await lockAlert(tx, user, id);
    if (alert.status === 'RESOLVED') throw conflict('ALERT_ALREADY_RESOLVED', 'This alert has already been resolved.');
    await tx.query(
      `UPDATE wellbeing_alerts
          SET status = 'RESOLVED', resolved_by = $2, resolved_at = now(),
              acknowledged_by = COALESCE(acknowledged_by, $2), acknowledged_at = COALESCE(acknowledged_at, now())
        WHERE id = $1`,
      [id, user.id],
    );
    if (comment) await addComment(tx, id, user.id, comment);
    await recordAudit(tx, { actorId: user.id, action: 'WELLBEING_ALERT_RESOLVED', entityType: 'wellbeing_alert', entityId: id, ip });
  });
  return getAlert(user, id);
}

export async function commentOnAlert(user: AuthUser, id: number, comment: string, ip: string | null) {
  await withTransaction(async (tx) => {
    await lockAlert(tx, user, id);
    await addComment(tx, id, user.id, comment);
    await recordAudit(tx, { actorId: user.id, action: 'WELLBEING_ALERT_COMMENTED', entityType: 'wellbeing_alert', entityId: id, ip });
  });
  return getAlert(user, id);
}

// ------------------------------------------------------------------ the employee's side

/** The supportive "take a break" recommendation shown on the employee dashboard while an alert is open. */
export async function getBreakRecommendation(employeeId: number, tx: Db = db) {
  const { rows } = await tx.query(
    `SELECT a.id AS "alertId", a.triggered_at AS "triggeredAt",
            (SELECT json_build_object('id', sr.id, 'status', sr.status, 'managerComment', sr.manager_comment)
               FROM support_requests sr WHERE sr.alert_id = a.id AND sr.type = 'BREAK' ORDER BY sr.created_at DESC LIMIT 1) AS request
       FROM wellbeing_alerts a
      WHERE a.employee_id = $1 AND a.status <> 'RESOLVED'
      ORDER BY a.triggered_at DESC, a.id DESC LIMIT 1`,
    [employeeId],
  );
  return rows[0] ?? null;
}

/** Used when a break request is raised from the recommendation. */
export async function assertOwnOpenAlert(tx: Db, employeeId: number, alertId: number) {
  const { rows } = await tx.query('SELECT status FROM wellbeing_alerts WHERE id = $1 AND employee_id = $2', [alertId, employeeId]);
  if (rows.length === 0) throw notFound('Alert');
  if (rows[0].status === 'RESOLVED') throw conflict('ALERT_ALREADY_RESOLVED', 'This recommendation is no longer active.');
}
