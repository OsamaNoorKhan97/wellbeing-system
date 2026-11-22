import { db } from '../db/pool';
import { notificationEvents, type NotificationType } from './notification.service';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Lock-screen text is deliberately generic: it never contains an employee's name, ratings or request text.
const GENERIC: Record<NotificationType, string> = {
  BREAK_REQUESTED: 'A break request needs your review.',
  DISCUSSION_REQUESTED: 'A discussion request needs your review.',
  BREAK_APPROVED: 'Your break request has been answered.',
  BREAK_REJECTED: 'Your break request has been answered.',
  REQUEST_CANCELLED: 'A request was withdrawn.',
  MEETING_SCHEDULED: 'A meeting has been scheduled.',
  MEETING_UPDATED: 'A meeting was updated.',
  MEETING_CANCELLED: 'A meeting was cancelled.',
  MEETING_REJECTED: 'A meeting was declined.',
  MEETING_RESCHEDULED: 'A meeting has a new time.',
  MEETING_REMINDER: 'You have a meeting reminder.',
  WELLBEING_ALERT: 'A well-being alert needs attention.',
  MANAGER_ASSIGNED: 'Your Line Manager assignment changed.',
  TEAM_MEMBER_ASSIGNED: 'Your team changed.',
};

interface Created {
  id: number;
  recipientId: number;
  type: NotificationType;
}

async function send(n: Created): Promise<void> {
  const { rows: devices } = await db.query('SELECT id, token FROM device_tokens WHERE user_id = $1 AND is_valid', [n.recipientId]);
  if (devices.length === 0) return;
  const { rows: stored } = await db.query('SELECT entity_type AS "entityType", entity_id AS "entityId" FROM notifications WHERE id = $1', [n.id]);
  if (stored.length === 0) return; // the transaction that raised it rolled back
  const messages = devices.map((d) => ({
    to: d.token,
    title: 'WellBeing',
    body: GENERIC[n.type] ?? 'You have a new notification.',
    sound: 'default',
    channelId: 'default',
    data: { notificationId: n.id, type: n.type, entityType: stored[0].entityType, entityId: stored[0].entityId },
  }));
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!response.ok) throw new Error(`Push gateway answered ${response.status}`);
  const payload = (await response.json()) as { data?: { status: string; details?: { error?: string } }[] };
  // A token the gateway reports as unregistered is never used again.
  const dead = (payload.data ?? []).map((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? devices[i].id : null)).filter((x) => x !== null);
  if (dead.length) await db.query('UPDATE device_tokens SET is_valid = false WHERE id = ANY($1::int[])', [dead]);
}

let started = false;

/** Sends one push message per stored notification. Started by the server process only (not by tests). */
export function startPushService(): void {
  if (started || process.env.PUSH_ENABLED === 'false') return;
  started = true;
  notificationEvents.on('created', (n: Created) => {
    // The notification is inserted inside a transaction; wait for it to commit before looking it up.
    setTimeout(() => send(n).catch((error) => console.error('Push failed:', error.message)), 1500).unref();
  });
}
