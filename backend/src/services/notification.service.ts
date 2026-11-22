import { EventEmitter } from 'node:events';
import type { Db } from '../db/pool';

export type NotificationType =
  | 'BREAK_REQUESTED'
  | 'DISCUSSION_REQUESTED'
  | 'BREAK_APPROVED'
  | 'BREAK_REJECTED'
  | 'REQUEST_CANCELLED'
  | 'MEETING_SCHEDULED'
  | 'MEETING_UPDATED'
  | 'MEETING_CANCELLED'
  | 'MEETING_REJECTED'
  | 'MEETING_RESCHEDULED'
  | 'MEETING_REMINDER'
  | 'WELLBEING_ALERT'
  | 'MANAGER_ASSIGNED'
  | 'TEAM_MEMBER_ASSIGNED';

export interface NewNotification {
  recipientId: number;
  relatedUserId?: number | null;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: 'support_request' | 'meeting' | 'assignment' | 'wellbeing_alert';
  entityId?: number;
}

/**
 * Every notification passes through here. A WebSocket, Server-Sent Events or
 * web-push transport can subscribe to the "created" event without touching the modules
 * that raise notifications.
 */
export const notificationEvents = new EventEmitter();

export async function notify(tx: Db, input: NewNotification): Promise<void> {
  const { rows } = await tx.query(
    `INSERT INTO notifications (recipient_id, related_user_id, type, title, message, entity_type, entity_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, recipient_id AS "recipientId", type, title, message, created_at AS "createdAt"`,
    [input.recipientId, input.relatedUserId ?? null, input.type, input.title, input.message, input.entityType ?? null, input.entityId ?? null],
  );
  notificationEvents.emit('created', rows[0]);
}
