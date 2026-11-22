import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/pool';
import { authenticate, currentUser } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { asyncHandler, ok } from '../../utils/http';

const registerBody = z.object({
  token: z.string().trim().min(10).max(300),
  platform: z.enum(['ios', 'android']),
  deviceName: z.string().trim().max(120).nullish(),
});
const removeBody = z.object({ token: z.string().trim().min(10).max(300) });

/** Push-notification devices of the mobile app. Registering a token that another account used moves it to the signed-in user. */
export const devicesRouter = Router();
devicesRouter.use(authenticate);

devicesRouter.post(
  '/',
  validate({ body: registerBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof registerBody>;
    const { rows } = await db.query(
      `INSERT INTO device_tokens (user_id, token, platform, device_name) VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
         device_name = EXCLUDED.device_name, is_valid = true, last_seen_at = now()
       RETURNING id, platform, device_name AS "deviceName"`,
      [currentUser(req).id, body.token, body.platform, body.deviceName ?? null],
    );
    ok(res, rows[0]);
  }),
);

// POST rather than DELETE-with-body so every HTTP client can send it (used on logout).
devicesRouter.post(
  '/unregister',
  validate({ body: removeBody }),
  asyncHandler(async (req, res) => {
    const { token } = req.body as z.infer<typeof removeBody>;
    const result = await db.query('DELETE FROM device_tokens WHERE token = $1 AND user_id = $2', [token, currentUser(req).id]);
    ok(res, { removed: result.rowCount ?? 0 });
  }),
);
