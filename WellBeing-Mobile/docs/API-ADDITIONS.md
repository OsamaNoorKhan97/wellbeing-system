# Backend additions for the mobile app

Everything else the app uses already existed in the web backend (see the web project's `docs/API.md`). These additions are backward compatible: one new table, one router and one background sender. No existing endpoint, table or response changed.

## Migration `004_device_tokens.sql`

`device_tokens(id, user_id -> users ON DELETE CASCADE, token UNIQUE, platform 'ios'|'android', device_name, is_valid, created_at, last_seen_at)`

## Endpoints (authenticated, any role)

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/api/v1/devices` | `{ token, platform: "ios" \| "android", deviceName? }` | `{ id, platform, deviceName }`. Idempotent. A token that belonged to another account moves to the signed-in user and is marked valid again. A user can register any number of devices. |
| POST | `/api/v1/devices/unregister` | `{ token }` | `{ removed: 0 \| 1 }`. Only the owner can remove a token. Called on logout. |

Validation: `token` 10-300 characters, `platform` must be `ios` or `android` (422 otherwise), 401 without a valid session.

## Push sender (`src/services/push.service.ts`)

- Started by `server.ts` only (not by the API tests). Disable with `PUSH_ENABLED=false`.
- Listens to the existing `notificationEvents` `created` event, so every notification the backend already creates is pushed without touching the modules that create them.
- Waits 1.5 s for the creating transaction to commit; if the row is not there (rolled back) nothing is sent.
- Sends one message per valid device through `https://exp.host/--/api/v2/push/send`. Payload: `title: "WellBeing"`, a generic `body` per notification type, and `data: { notificationId, type, entityType, entityId }` for deep links.
- **Privacy:** the body never contains a name, a score or request text.
- A token reported as `DeviceNotRegistered` is set `is_valid = false` and never used again.
- Failures are logged and never affect the API request that created the notification.

Tests: `backend/tests/devices.test.ts`, `backend/tests/push.test.ts` (generic text, one message per device, exactly-once per notification, dead-token handling). Full backend suite: 95 passing.
