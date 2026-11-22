import { db, withTransaction, type Db } from '../../db/pool';
import type { AuthUser } from '../../middleware/authenticate';
import { getActiveManager } from '../../services/assignment.service';
import { recordAudit } from '../../services/audit.service';
import { notify } from '../../services/notification.service';
import { conflict, notFound, offsetOf } from '../../utils/http';
import { assertOwnOpenAlert } from '../alerts/alerts.service';
import { insertMeeting, type MeetingInput } from '../meetings/meetings.service';

export type RequestType = 'BREAK' | 'DISCUSSION';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

const REQUEST_SELECT = `
  SELECT sr.id, sr.type, sr.status, sr.reason, sr.manager_comment AS "managerComment", sr.alert_id AS "alertId",
         sr.resolved_at AS "resolvedAt", sr.created_at AS "createdAt", sr.updated_at AS "updatedAt",
         e.id AS "employeeId", e.full_name AS "employeeName", e.employee_code AS "employeeCode",
         ep.department AS "employeeDepartment",
         m.id AS "managerId", m.full_name AS "managerName",
         mt.id AS "meetingId", mt.scheduled_at AS "meetingAt", mt.duration_minutes AS "meetingDurationMinutes",
         mt.purpose AS "meetingPurpose", mt.location AS "meetingLocation"
    FROM support_requests sr
    JOIN users e ON e.id = sr.employee_id
    JOIN users m ON m.id = sr.manager_id
    LEFT JOIN employee_profiles ep ON ep.user_id = e.id
    LEFT JOIN meetings mt ON mt.request_id = sr.id AND mt.status NOT IN ('CANCELLED', 'REJECTED')`;

const ownerColumn = (user: AuthUser) => (user.role === 'LINE_MANAGER' ? 'sr.manager_id' : 'sr.employee_id');

async function findRequest(tx: Db, id: number) {
  const { rows } = await tx.query(`${REQUEST_SELECT} WHERE sr.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createRequest(
  employee: AuthUser,
  type: RequestType,
  reason: string | null,
  ip: string | null,
  alertId: number | null = null,
) {
  return withTransaction(async (tx) => {
    if (alertId !== null) {
      if (type !== 'BREAK') throw conflict('WRONG_REQUEST_TYPE', 'Only a break can be requested from a well-being recommendation');
      await assertOwnOpenAlert(tx, employee.id, alertId);
    }
    const manager = await getActiveManager(employee.id, tx);
    if (!manager) {
      throw conflict('NO_MANAGER_ASSIGNED', 'You do not have a Line Manager assigned yet. Please contact HR so your request can be routed.');
    }
    const open = await tx.query(`SELECT 1 FROM support_requests WHERE employee_id = $1 AND type = $2 AND status = 'PENDING'`, [employee.id, type]);
    if (open.rows.length > 0) {
      throw conflict('REQUEST_ALREADY_PENDING', `You already have a pending ${type === 'BREAK' ? 'break' : 'discussion'} request.`);
    }

    const { rows } = await tx.query(
      'INSERT INTO support_requests (employee_id, manager_id, type, reason, alert_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [employee.id, manager.id, type, reason, alertId],
    );
    const requestId: number = rows[0].id;
    await notify(tx, {
      recipientId: manager.id,
      relatedUserId: employee.id,
      type: type === 'BREAK' ? 'BREAK_REQUESTED' : 'DISCUSSION_REQUESTED',
      title: type === 'BREAK' ? 'New break request' : 'New discussion request',
      message:
        type === 'BREAK'
          ? `${employee.fullName} has requested a break${alertId ? ' after a well-being alert recommended one' : ''}.`
          : `${employee.fullName} would like to have a discussion with you.`,
      entityType: 'support_request',
      entityId: requestId,
    });
    await recordAudit(tx, { actorId: employee.id, action: 'REQUEST_CREATED', entityType: 'support_request', entityId: requestId, details: { type, alertId }, ip });
    return findRequest(tx, requestId);
  });
}

export interface RequestListQuery {
  page: number;
  pageSize: number;
  type?: RequestType;
  status?: RequestStatus;
}

export async function listRequests(user: AuthUser, query: RequestListQuery) {
  const where = [`${ownerColumn(user)} = $1`];
  const params: unknown[] = [user.id];
  if (query.type) {
    params.push(query.type);
    where.push(`sr.type = $${params.length}`);
  }
  if (query.status) {
    params.push(query.status);
    where.push(`sr.status = $${params.length}`);
  }
  const whereSql = where.join(' AND ');
  const total = await db.query(`SELECT count(*)::int AS total FROM support_requests sr WHERE ${whereSql}`, params);
  const { rows } = await db.query(
    `${REQUEST_SELECT} WHERE ${whereSql}
      ORDER BY (sr.status = 'PENDING') DESC, sr.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, query.pageSize, offsetOf(query.page, query.pageSize)],
  );
  return { items: rows, total: total.rows[0].total as number };
}

export async function getRequest(user: AuthUser, id: number) {
  const { rows } = await db.query(`${REQUEST_SELECT} WHERE sr.id = $1 AND ${ownerColumn(user)} = $2`, [id, user.id]);
  if (rows.length === 0) throw notFound('Request');
  return rows[0];
}

/** Locks the row so two simultaneous decisions cannot both succeed. Requests of other users are reported as missing. */
async function lockPending(tx: Db, user: AuthUser, id: number, type?: RequestType) {
  const column = user.role === 'LINE_MANAGER' ? 'manager_id' : 'employee_id';
  const { rows } = await tx.query(`SELECT id, type, status, employee_id FROM support_requests WHERE id = $1 AND ${column} = $2 FOR UPDATE`, [
    id,
    user.id,
  ]);
  const request = rows[0];
  if (!request) throw notFound('Request');
  if (type && request.type !== type) {
    throw conflict('WRONG_REQUEST_TYPE', type === 'BREAK' ? 'Only break requests can be approved or rejected' : 'Only discussion requests can be scheduled');
  }
  if (request.status !== 'PENDING') throw conflict('REQUEST_NOT_PENDING', 'This request has already been handled');
  return request;
}

export async function decideBreakRequest(manager: AuthUser, id: number, approve: boolean, comment: string | null, ip: string | null) {
  return withTransaction(async (tx) => {
    const request = await lockPending(tx, manager, id, 'BREAK');
    await tx.query(
      'UPDATE support_requests SET status = $2, manager_comment = $3, resolved_by = $4, resolved_at = now() WHERE id = $1',
      [id, approve ? 'APPROVED' : 'REJECTED', comment, manager.id],
    );
    await notify(tx, {
      recipientId: request.employee_id,
      relatedUserId: manager.id,
      type: approve ? 'BREAK_APPROVED' : 'BREAK_REJECTED',
      title: approve ? 'Break request approved' : 'Break request rejected',
      message:
        `${manager.fullName} ${approve ? 'approved' : 'rejected'} your break request.` + (comment ? ` Comment: ${comment}` : ''),
      entityType: 'support_request',
      entityId: id,
    });
    await recordAudit(tx, {
      actorId: manager.id,
      action: approve ? 'BREAK_APPROVED' : 'BREAK_REJECTED',
      entityType: 'support_request',
      entityId: id,
      details: { hasComment: Boolean(comment) },
      ip,
    });
    return findRequest(tx, id);
  });
}

export async function scheduleDiscussion(manager: AuthUser, id: number, input: MeetingInput, ip: string | null) {
  return withTransaction(async (tx) => {
    const request = await lockPending(tx, manager, id, 'DISCUSSION');
    await insertMeeting(tx, manager, request.employee_id, input, id, ip);
    await tx.query(`UPDATE support_requests SET status = 'SCHEDULED', resolved_by = $2, resolved_at = now() WHERE id = $1`, [id, manager.id]);
    return findRequest(tx, id);
  });
}

export async function cancelOwnRequest(employee: AuthUser, id: number, ip: string | null) {
  return withTransaction(async (tx) => {
    await lockPending(tx, employee, id);
    const { rows } = await tx.query(
      `UPDATE support_requests SET status = 'CANCELLED', resolved_at = now() WHERE id = $1 RETURNING manager_id, type`,
      [id],
    );
    await notify(tx, {
      recipientId: rows[0].manager_id,
      relatedUserId: employee.id,
      type: 'REQUEST_CANCELLED',
      title: 'Request withdrawn',
      message: `${employee.fullName} withdrew their ${rows[0].type === 'BREAK' ? 'break' : 'discussion'} request.`,
      entityType: 'support_request',
      entityId: id,
    });
    await recordAudit(tx, { actorId: employee.id, action: 'REQUEST_CANCELLED', entityType: 'support_request', entityId: id, ip });
    return findRequest(tx, id);
  });
}
