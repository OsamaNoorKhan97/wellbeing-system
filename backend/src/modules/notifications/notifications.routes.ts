import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/pool';
import { authenticate, currentUser } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { asyncHandler, notFound, offsetOf, ok, pageMeta, paginationSchema, parseId } from '../../utils/http';

const NOTIFICATION_SELECT = `
  SELECT n.id, n.type, n.title, n.message, n.entity_type AS "entityType", n.entity_id AS "entityId",
         n.is_read AS "isRead", n.read_at AS "readAt", n.created_at AS "createdAt",
         ru.id AS "relatedUserId", ru.full_name AS "relatedUserName"
    FROM notifications n LEFT JOIN users ru ON ru.id = n.related_user_id`;

const listQuery = paginationSchema.extend({ unreadOnly: z.enum(['true', 'false']).optional() });

export async function listNotifications(userId: number, page: number, pageSize: number, unreadOnly = false) {
  const filter = unreadOnly ? 'AND NOT n.is_read' : '';
  const counts = await db.query(
    `SELECT count(*) FILTER (WHERE true ${unreadOnly ? 'AND NOT is_read' : ''})::int AS total,
            count(*) FILTER (WHERE NOT is_read)::int AS unread
       FROM notifications WHERE recipient_id = $1`,
    [userId],
  );
  const { rows } = await db.query(
    `${NOTIFICATION_SELECT} WHERE n.recipient_id = $1 ${filter} ORDER BY n.created_at DESC, n.id DESC LIMIT $2 OFFSET $3`,
    [userId, pageSize, offsetOf(page, pageSize)],
  );
  return { items: rows, total: counts.rows[0].total as number, unread: counts.rows[0].unread as number };
}

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as z.infer<typeof listQuery>;
    const { items, total, unread } = await listNotifications(currentUser(req).id, query.page, query.pageSize, query.unreadOnly === 'true');
    ok(res, items, { ...pageMeta(query.page, query.pageSize, total), unread });
  }),
);

notificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query('SELECT count(*)::int AS unread FROM notifications WHERE recipient_id = $1 AND NOT is_read', [
      currentUser(req).id,
    ]);
    ok(res, { unread: rows[0].unread });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const result = await db.query('UPDATE notifications SET is_read = true, read_at = now() WHERE recipient_id = $1 AND NOT is_read', [
      currentUser(req).id,
    ]);
    ok(res, { updated: result.rowCount ?? 0 });
  }),
);

notificationsRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `UPDATE notifications SET is_read = true, read_at = COALESCE(read_at, now())
        WHERE id = $1 AND recipient_id = $2 RETURNING id, is_read AS "isRead", read_at AS "readAt"`,
      [parseId(req.params.id), currentUser(req).id],
    );
    if (rows.length === 0) throw notFound('Notification');
    ok(res, rows[0]);
  }),
);
