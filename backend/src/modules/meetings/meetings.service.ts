import { db, withTransaction, type Db } from '../../db/pool';
import type { AuthUser } from '../../middleware/authenticate';
import { isAssignedTo } from '../../services/assignment.service';
import { recordAudit } from '../../services/audit.service';
import { notify } from '../../services/notification.service';
import { getSettings } from '../../services/settings.service';
import { formatMeetingTime } from '../../utils/dates';
import { badRequest, conflict, forbidden, notFound, offsetOf } from '../../utils/http';

const MEETING_SELECT = `
  SELECT mt.id, mt.request_id AS "requestId", mt.scheduled_at AS "scheduledAt",
         mt.duration_minutes AS "durationMinutes", mt.purpose, mt.location, mt.status,
         mt.cancellation_reason AS "cancellationReason", mt.created_at AS "createdAt", mt.updated_at AS "updatedAt",
         e.id AS "employeeId", e.full_name AS "employeeName", e.employee_code AS "employeeCode",
         m.id AS "managerId", m.full_name AS "managerName"
    FROM meetings mt
    JOIN users e ON e.id = mt.employee_id
    JOIN users m ON m.id = mt.manager_id`;

export interface MeetingInput {
  scheduledAt: Date;
  durationMinutes: number;
  purpose?: string | null;
  location?: string | null;
}

async function findMeeting(tx: Db, id: number) {
  const { rows } = await tx.query(`${MEETING_SELECT} WHERE mt.id = $1`, [id]);
  return rows[0] ?? null;
}

async function describe(tx: Db, input: MeetingInput): Promise<string> {
  const { timezone } = await getSettings(tx);
  const when = formatMeetingTime(input.scheduledAt, timezone);
  const parts = [`Date: ${when.date}`, `Time: ${when.time} (${timezone})`, `Duration: ${input.durationMinutes} min`];
  if (input.location) parts.push(`Where: ${input.location}`);
  parts.push(`Purpose: ${input.purpose || 'Not specified'}`);
  return parts.join(' · ');
}

function assertFuture(date: Date) {
  if (date.getTime() <= Date.now()) throw badRequest('The meeting must be scheduled for a future date and time');
}

/** Shared by direct scheduling and by scheduling from a discussion request. Caller has already checked permissions. */
export async function insertMeeting(
  tx: Db,
  manager: AuthUser,
  employeeId: number,
  input: MeetingInput,
  requestId: number | null,
  ip: string | null,
) {
  assertFuture(input.scheduledAt);
  const { rows } = await tx.query(
    `INSERT INTO meetings (request_id, employee_id, manager_id, scheduled_at, duration_minutes, purpose, location)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [requestId, employeeId, manager.id, input.scheduledAt, input.durationMinutes, input.purpose || null, input.location || null],
  );
  const meetingId: number = rows[0].id;
  await notify(tx, {
    recipientId: employeeId,
    relatedUserId: manager.id,
    type: 'MEETING_SCHEDULED',
    title: 'Meeting scheduled',
    message: `${manager.fullName} scheduled a meeting with you. ${await describe(tx, input)}`,
    entityType: 'meeting',
    entityId: meetingId,
  });
  await recordAudit(tx, { actorId: manager.id, action: 'MEETING_SCHEDULED', entityType: 'meeting', entityId: meetingId, details: { requestId }, ip });
  return findMeeting(tx, meetingId);
}

export async function scheduleMeeting(manager: AuthUser, employeeId: number, input: MeetingInput, ip: string | null) {
  return withTransaction(async (tx) => {
    if (!(await isAssignedTo(manager.id, employeeId, tx))) throw forbidden('You can only schedule meetings with employees assigned to you');
    return insertMeeting(tx, manager, employeeId, input, null, ip);
  });
}

export interface MeetingListQuery {
  page: number;
  pageSize: number;
  scope: 'upcoming' | 'past' | 'all';
}

export async function listMeetings(user: AuthUser, query: MeetingListQuery) {
  const column = user.role === 'LINE_MANAGER' ? 'mt.manager_id' : 'mt.employee_id';
  const scopeSql =
    query.scope === 'upcoming'
      ? `AND mt.status = 'SCHEDULED' AND mt.scheduled_at >= now()`
      : query.scope === 'past'
        ? `AND (mt.status <> 'SCHEDULED' OR mt.scheduled_at < now())`
        : '';
  const order = query.scope === 'upcoming' ? 'mt.scheduled_at ASC' : 'mt.scheduled_at DESC';
  const total = await db.query(`SELECT count(*)::int AS total FROM meetings mt WHERE ${column} = $1 ${scopeSql}`, [user.id]);
  const { rows } = await db.query(
    `${MEETING_SELECT} WHERE ${column} = $1 ${scopeSql} ORDER BY ${order} LIMIT $2 OFFSET $3`,
    [user.id, query.pageSize, offsetOf(query.page, query.pageSize)],
  );
  return { items: rows, total: total.rows[0].total as number };
}

async function lockOwnScheduledMeeting(tx: Db, manager: AuthUser, id: number) {
  const { rows } = await tx.query('SELECT manager_id, status FROM meetings WHERE id = $1 FOR UPDATE', [id]);
  // A meeting owned by another manager is reported as missing, so its existence is not revealed.
  if (rows.length === 0 || rows[0].manager_id !== manager.id) throw notFound('Meeting');
  if (rows[0].status !== 'SCHEDULED') throw conflict('MEETING_NOT_ACTIVE', 'Only scheduled meetings can be changed');
  return (await findMeeting(tx, id))!;
}

export async function updateMeeting(manager: AuthUser, id: number, changes: Partial<MeetingInput>, ip: string | null) {
  return withTransaction(async (tx) => {
    const meeting = await lockOwnScheduledMeeting(tx, manager, id);
    const next: MeetingInput = {
      scheduledAt: changes.scheduledAt ?? meeting.scheduledAt,
      durationMinutes: changes.durationMinutes ?? meeting.durationMinutes,
      purpose: changes.purpose !== undefined ? changes.purpose : meeting.purpose,
      location: changes.location !== undefined ? changes.location : meeting.location,
    };
    if (changes.scheduledAt) assertFuture(next.scheduledAt);
    await tx.query('UPDATE meetings SET scheduled_at = $2, duration_minutes = $3, purpose = $4, location = $5 WHERE id = $1', [
      id,
      next.scheduledAt,
      next.durationMinutes,
      next.purpose || null,
      next.location || null,
    ]);
    await notify(tx, {
      recipientId: meeting.employeeId,
      relatedUserId: manager.id,
      type: 'MEETING_UPDATED',
      title: 'Meeting updated',
      message: `${manager.fullName} updated your meeting. ${await describe(tx, next)}`,
      entityType: 'meeting',
      entityId: id,
    });
    await recordAudit(tx, { actorId: manager.id, action: 'MEETING_UPDATED', entityType: 'meeting', entityId: id, ip });
    return findMeeting(tx, id);
  });
}

async function cancelLocked(tx: Db, meeting: any, actorId: number, actorName: string | null, reason: string | null, ip: string | null) {
  await tx.query(`UPDATE meetings SET status = 'CANCELLED', cancellation_reason = $2 WHERE id = $1`, [meeting.id, reason]);
  // The employee still needs the conversation, so the originating request goes back to the manager's queue.
  if (meeting.requestId) {
    await tx.query(`UPDATE support_requests SET status = 'PENDING' WHERE id = $1 AND status = 'SCHEDULED'`, [meeting.requestId]);
  }
  const { timezone } = await getSettings(tx);
  const when = formatMeetingTime(meeting.scheduledAt, timezone);
  await notify(tx, {
    recipientId: meeting.employeeId,
    relatedUserId: meeting.managerId,
    type: 'MEETING_CANCELLED',
    title: 'Meeting cancelled',
    message:
      `Your meeting with ${actorName ?? meeting.managerName} on ${when.date} at ${when.time} was cancelled.` +
      (reason ? ` Reason: ${reason}` : ''),
    entityType: 'meeting',
    entityId: meeting.id,
  });
  await recordAudit(tx, { actorId, action: 'MEETING_CANCELLED', entityType: 'meeting', entityId: meeting.id, details: { reason }, ip });
}

export async function cancelMeeting(manager: AuthUser, id: number, reason: string | null, ip: string | null) {
  return withTransaction(async (tx) => {
    const meeting = await lockOwnScheduledMeeting(tx, manager, id);
    await cancelLocked(tx, meeting, manager.id, manager.fullName, reason, ip);
    return findMeeting(tx, id);
  });
}

export async function completeMeeting(manager: AuthUser, id: number, ip: string | null) {
  return withTransaction(async (tx) => {
    const meeting = await lockOwnScheduledMeeting(tx, manager, id);
    await tx.query(`UPDATE meetings SET status = 'COMPLETED' WHERE id = $1`, [id]);
    if (meeting.requestId) {
      await tx.query(
        `UPDATE support_requests SET status = 'COMPLETED', resolved_by = $2, resolved_at = now() WHERE id = $1 AND status = 'SCHEDULED'`,
        [meeting.requestId, manager.id],
      );
    }
    await recordAudit(tx, { actorId: manager.id, action: 'MEETING_COMPLETED', entityType: 'meeting', entityId: id, ip });
    return findMeeting(tx, id);
  });
}

/** Used when a user's role changes: their upcoming meetings (on either side) can no longer take place as planned. */
export async function cancelMeetingsForUser(tx: Db, userId: number, actorId: number, reason: string): Promise<void> {
  const { rows } = await tx.query(
    `${MEETING_SELECT} WHERE (mt.employee_id = $1 OR mt.manager_id = $1) AND mt.status = 'SCHEDULED' AND mt.scheduled_at >= now()`,
    [userId],
  );
  for (const meeting of rows) await cancelLocked(tx, meeting, actorId, null, reason, null);
}
