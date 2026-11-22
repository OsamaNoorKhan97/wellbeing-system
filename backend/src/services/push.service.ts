import { createSign } from 'node:crypto';
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
interface Device {
  id: number;
  token: string;
}
interface PushData {
  notificationId: number;
  type: string;
  entityType: string | null;
  entityId: number | null;
}

/* ------------------------------------------------------------------ Expo push service (ExponentPushToken[...]) */

async function sendExpo(devices: Device[], body: string, data: PushData): Promise<number[]> {
  const messages = devices.map((d) => ({ to: d.token, title: 'WellBeing', body, sound: 'default', channelId: 'default', data }));
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!response.ok) throw new Error(`Expo push gateway answered ${response.status}`);
  const payload = (await response.json()) as { data?: { status: string; details?: { error?: string } }[] };
  return (payload.data ?? []).map((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? devices[i]!.id : -1)).filter((id) => id !== -1);
}

/* ------------------------------------------------------- Firebase Cloud Messaging HTTP v1 (native Android tokens) */

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    // Accept plain JSON or base64 of the JSON (easier to store in a hosting dashboard).
    return JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')) as ServiceAccount;
  } catch {
    console.error('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
    return null;
  }
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');
let cached: { token: string; expires: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const uri = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: uri, iat: now, exp: now + 3600 }),
  )}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key);
  const response = await fetch(uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(signature)}` }),
  });
  if (!response.ok) throw new Error(`Google token endpoint answered ${response.status}`);
  const json = (await response.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return cached.token;
}

async function sendFcm(devices: Device[], body: string, data: PushData): Promise<number[]> {
  const sa = serviceAccount();
  if (!sa) return []; // not configured: leave the tokens alone so they work once it is
  const bearer = await accessToken(sa);
  const dead: number[] = [];
  const stringData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v == null ? '' : String(v)]));
  await Promise.all(
    devices.map(async (d) => {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: d.token,
            notification: { title: 'WellBeing', body },
            data: stringData,
            android: { priority: 'HIGH', notification: { channel_id: 'default' } },
          },
        }),
      });
      if (response.ok) return;
      const text = await response.text();
      if (response.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(text)) dead.push(d.id);
      else console.error(`FCM answered ${response.status}`);
    }),
  );
  return dead;
}

/* ------------------------------------------------------------------------------------------------- dispatcher */

async function send(n: Created): Promise<void> {
  const { rows: devices } = await db.query('SELECT id, token FROM device_tokens WHERE user_id = $1 AND is_valid', [n.recipientId]);
  if (devices.length === 0) return;
  const { rows: stored } = await db.query('SELECT entity_type AS "entityType", entity_id AS "entityId" FROM notifications WHERE id = $1', [n.id]);
  if (stored.length === 0) return; // the transaction that raised it rolled back
  const body = GENERIC[n.type] ?? 'You have a new notification.';
  const data: PushData = { notificationId: n.id, type: n.type, entityType: stored[0].entityType, entityId: stored[0].entityId };

  const expo = (devices as Device[]).filter((d) => d.token.startsWith('ExponentPushToken') || d.token.startsWith('ExpoPushToken'));
  const fcm = (devices as Device[]).filter((d) => !expo.includes(d));
  const results = await Promise.allSettled([expo.length ? sendExpo(expo, body, data) : [], fcm.length ? sendFcm(fcm, body, data) : []]);
  const dead: number[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') dead.push(...r.value);
    else console.error('Push failed:', r.reason?.message ?? r.reason);
  }
  // A token the gateway reports as unregistered is never used again.
  if (dead.length) await db.query('UPDATE device_tokens SET is_valid = false WHERE id = ANY($1::int[])', [dead]);
}

let started = false;

/** Sends one push message per stored notification and device. Started by the server process only (not by tests). */
export function startPushService(): void {
  if (started || process.env.PUSH_ENABLED === 'false') return;
  started = true;
  notificationEvents.on('created', (n: Created) => {
    // The notification is inserted inside a transaction; wait for it to commit before looking it up.
    setTimeout(() => send(n).catch((error) => console.error('Push failed:', error.message)), 1500).unref();
  });
}
