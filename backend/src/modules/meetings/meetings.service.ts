import { db, withTransaction, type Db } from '../../db/pool';
import type { AuthUser } from '../../middleware/authenticate';
import { isAssignedTo } from '../../services/assignment.service';
import { recordAudit } from '../../services/audit.service';
import { notify } from '../../services/notification.service';
import { getSettings } from '../../services/settings.service';
import { formatMeetingTime } from '../../utils/dates';
import { badRequest, conflict, forbidden, notFound, offsetOf } from '../../utils/http';

/** A meeting that can still take place. Rescheduled meetings are active; rejected, cancelled and completed ones are not. */
export const ACTIVE_MEETING = `('SCHEDULED', 'RESCHEDULED')`;

const MEETING_SELECT = `
  SELECT mt.id, mt.request_id AS "requestId", mt.scheduled_at AS "scheduledAt",
         mt.duration_minutes AS "durationMinutes", mt.purpose, mt.location, mt.status,
         mt.cancellation_reason AS "cancellationReason", mt.rejection_reason AS "rejectionReason",
         mt.reschedule_count AS "rescheduleCount",
         mt.reminder_snoozed_until AS "snoozedUntil", mt.reminder_snooze_count AS "snoozeCount",
         mt.created_at AS "createdAt", mt.updated_at AS "updatedAt",
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
      ? `AND mt.status IN ${ACTIVE_MEETING} AND mt.scheduled_at >= now()`
      : query.scope === 'past'
        ? `AND (mt.status NOT IN ${ACTIVE_MEETING} OR mt.scheduled_at < now())`
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
  if (!['SCHEDULED', 'RESCHEDULED'].includes(rows[0].status)) {
    throw conflict('MEETING_NOT_ACTIVE', 'Only scheduled or rescheduled meetings can be changed');
  }
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
  await tx.query(`UPDATE meetings SET status = 'CANCELLED', cancellation_reason = $2, reminder_snoozed_until = NULL WHERE id = $1`, [meeting.id, reason]);
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
    await tx.query('UPDATE meetings SET reminder_snoozed_until = NULL WHERE id = $1', [id]);
    await recordAudit(tx, { actorId: manager.id, action: 'MEETING_COMPLETED', entityType: 'meeting', entityId: id, ip });
    return findMeeting(tx, id);
  });
}

// ---------------------------------------------------------------- reject, reschedule, snooze

async function addHistory(
  tx: Db,
  entry: {
    meetingId: number;
    actorId: number;
    action: 'RESCHEDULED' | 'REJECTED' | 'SNOOZED' | 'REMINDER_SENT';
    previousScheduledAt?: Date | null;
    newScheduledAt?: Date | null;
    previousDurationMinutes?: number | null;
    snoozedUntil?: Date | null;
    reason?: string | null;
  },
) {
  await tx.query(
    `INSERT INTO meeting_history (meeting_id, actor_id, action, previous_scheduled_at, new_scheduled_at, previous_duration_minutes, snoozed_until, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.meetingId,
      entry.actorId,
      entry.action,
      entry.previousScheduledAt ?? null,
      entry.newScheduledAt ?? null,
      entry.previousDurationMinutes ?? null,
      entry.snoozedUntil ?? null,
      entry.reason ?? null,
    ],
  );
}

export async function rejectMeeting(manager: AuthUser, id: number, reason: string | null, ip: string | null) {
  return withTransaction(async (tx) => {
    const meeting = await lockOwnScheduledMeeting(tx, manager, id);
    await tx.query(
      `UPDATE meetings SET status = 'REJECTED', rejection_reason = $2, reminder_snoozed_until = NULL WHERE id = $1`,
      [id, reason],
    );
    // As with a cancellation, the employee still needs the conversation, so the originating request returns to the queue.
    if (meeting.requestId) {
      await tx.query(`UPDATE support_requests SET status = 'PENDING' WHERE id = $1 AND status = 'SCHEDULED'`, [meeting.requestId]);
    }
    await addHistory(tx, { meetingId: id, actorId: manager.id, action: 'REJECTED', previousScheduledAt: meeting.scheduledAt, reason });
    const { timezone } = await getSettings(tx);
    const when = formatMeetingTime(meeting.scheduledAt, timezone);
    await notify(tx, {
      recipientId: meeting.employeeId,
      relatedUserId: manager.id,
      type: 'MEETING_REJECTED',
      title: 'Meeting rejected',
      message:
        `${manager.fullName} rejected the meeting planned for ${when.date} at ${when.time}.` + (reason ? ` Reason: ${reason}` : ''),
      entityType: 'meeting',
      entityId: id,
    });
    await recordAudit(tx, { actorId: manager.id, action: 'MEETING_REJECTED', entityType: 'meeting', entityId: id, details: { reason }, ip });
    return findMeeting(tx, id);
  });
}

export interface RescheduleInput {
  scheduledAt: Date;
  durationMinutes?: number;
  reason?: string | null;
}

export async function rescheduleMeeting(manager: AuthUser, id: number, input: RescheduleInput, ip: string | null) {
  return withTransaction(async (tx) => {
    const meeting = await lockOwnScheduledMeeting(tx, manager, id);
    assertFuture(input.scheduledAt);
    if (input.scheduledAt.getTime() === new Date(meeting.scheduledAt).getTime() && !input.durationMinutes) {
      throw badRequest('Choose a different date or time to reschedule the meeting');
    }
    // The previous schedule is kept in the meeting history before anything is overwritten.
    await addHistory(tx, {
      meetingId: id,
      actorId: manager.id,
      action: 'RESCHEDULED',
      previousScheduledAt: meeting.scheduledAt,
      newScheduledAt: input.scheduledAt,
      previousDurationMinutes: meeting.durationMinutes,
      reason: input.reason ?? null,
    });
    const durationMinutes = input.durationMinutes ?? meeting.durationMinutes;
    await tx.query(
      `UPDATE meetings
          SET scheduled_at = $2, duration_minutes = $3, status = 'RESCHEDULED', reschedule_count = reschedule_count + 1,
              reminder_snoozed_until = NULL
        WHERE id = $1`,
      [id, input.scheduledAt, durationMinutes],
    );
    const { timezone } = await getSettings(tx);
    const before = formatMeetingTime(meeting.scheduledAt, timezone);
    const after = formatMeetingTime(input.scheduledAt, timezone);
    await notify(tx, {
      recipientId: meeting.employeeId,
      relatedUserId: manager.id,
      type: 'MEETING_RESCHEDULED',
      title: 'Meeting rescheduled',
      message:
        `${manager.fullName} moved your meeting from ${before.date} at ${before.time} to ${after.date} at ${after.time} (${timezone}), ${durationMinutes} min.` +
        (input.reason ? ` Reason: ${input.reason}` : ''),
      entityType: 'meeting',
      entityId: id,
    });
    await recordAudit(tx, {
      actorId: manager.id,
      action: 'MEETING_RESCHEDULED',
      entityType: 'meeting',
      entityId: id,
      details: { from: meeting.scheduledAt, to: input.scheduledAt, reason: input.reason ?? null },
      ip,
    });
    return findMeeting(tx, id);
  });
}

export interface SnoozeInput {
  /** Preset length in minutes (60, 180, 1440) ... */
  minutes?: number;
  /** ... or a custom date and time. */
  until?: Date;
}

/** Postpones the manager's reminder only. scheduled_at, duration and status are left exactly as they were. */
export async function snoozeMeeting(manager: AuthUser, id: number, input: SnoozeInput, ip: string | null) {
  return withTransaction(async (tx) => {
    await lockOwnScheduledMeeting(tx, manager, id);
    const until = input.until ?? new Date(Date.now() + (input.minutes ?? 0) * 60_000);
    if (until.getTime() <= Date.now()) throw badRequest('Choose a snooze time in the future');
    if (until.getTime() > Date.now() + 365 * 86_400_000) throw badRequest('A reminder can be snoozed for one year at most');
    await tx.query(
      `UPDATE meetings SET reminder_snoozed_until = $2, reminder_snooze_count = reminder_snooze_count + 1 WHERE id = $1`,
      [id, until],
    );
    await addHistory(tx, { meetingId: id, actorId: manager.id, action: 'SNOOZED', snoozedUntil: until });
    await recordAudit(tx, { actorId: manager.id, action: 'MEETING_SNOOZED', entityType: 'meeting', entityId: id, details: { until }, ip });
    return findMeeting(tx, id);
  });
}

/**
 * Creates the reminder for every meeting whose snooze period has ended. Each snooze produces exactly one reminder:
 * the snooze is cleared in the same transaction, and rows are claimed with SKIP LOCKED so overlapping runs cannot duplicate it.
 */
export async function processDueReminders(): Promise<number> {
  // Cheap indexed check first: this runs on every notification poll and almost always finds nothing.
  const pending = await db.query('SELECT 1 FROM meetings WHERE reminder_snoozed_until IS NOT NULL AND reminder_snoozed_until <= now() LIMIT 1');
  if (pending.rows.length === 0) return 0;
  return withTransaction(async (tx) => {
    const due = await tx.query(
      `SELECT mt.id FROM meetings mt
        WHERE mt.reminder_snoozed_until IS NOT NULL AND mt.reminder_snoozed_until <= now()
        ORDER BY mt.reminder_snoozed_until FOR UPDATE SKIP LOCKED`,
    );
    let sent = 0;
    for (const row of due.rows) {
      const meeting = await findMeeting(tx, row.id);
      await tx.query('UPDATE meetings SET reminder_snoozed_until = NULL, last_reminder_at = now() WHERE id = $1', [row.id]);
      if (!meeting || !['SCHEDULED', 'RESCHEDULED'].includes(meeting.status)) continue;
      const { timezone } = await getSettings(tx);
      const when = formatMeetingTime(meeting.scheduledAt, timezone);
      await notify(tx, {
        recipientId: meeting.managerId,
        relatedUserId: meeting.employeeId,
        type: 'MEETING_REMINDER',
        title: 'Meeting reminder',
        message: `Reminder: your meeting with ${meeting.employeeName} is on ${when.date} at ${when.time} (${timezone}).`,
        entityType: 'meeting',
        entityId: meeting.id,
      });
      await addHistory(tx, { meetingId: meeting.id, actorId: meeting.managerId, action: 'REMINDER_SENT' });
      sent += 1;
    }
    return sent;
  });
}

/** The history of one meeting. Snooze entries are the manager's private reminders and are never shown to the employee. */
export async function getMeetingHistory(user: AuthUser, id: number) {
  const column = user.role === 'LINE_MANAGER' ? 'manager_id' : 'employee_id';
  const owned = await db.query(`SELECT 1 FROM meetings WHERE id = $1 AND ${column} = $2`, [id, user.id]);
  if (owned.rows.length === 0) throw notFound('Meeting');
  const { rows } = await db.query(
    `SELECT h.id, h.action, h.previous_scheduled_at AS "previousScheduledAt", h.new_scheduled_at AS "newScheduledAt",
            h.previous_duration_minutes AS "previousDurationMinutes", h.snoozed_until AS "snoozedUntil",
            h.reason, h.created_at AS "createdAt", u.full_name AS "actorName"
       FROM meeting_history h LEFT JOIN users u ON u.id = h.actor_id
      WHERE h.meeting_id = $1 ${user.role === 'LINE_MANAGER' ? '' : `AND h.action IN ('RESCHEDULED', 'REJECTED')`}
      ORDER BY h.created_at, h.id`,
    [id],
  );
  return rows;
}

/** Used when a user's role changes: their upcoming meetings (on either side) can no longer take place as planned. */
export async function cancelMeetingsForUser(tx: Db, userId: number, actorId: number, reason: string): Promise<void> {
  const { rows } = await tx.query(
    `${MEETING_SELECT} WHERE (mt.employee_id = $1 OR mt.manager_id = $1) AND mt.status IN ${ACTIVE_MEETING} AND mt.scheduled_at >= now()`,
    [userId],
  );
  for (const meeting of rows) await cancelLocked(tx, meeting, actorId, null, reason, null);
}
