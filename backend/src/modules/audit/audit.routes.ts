import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/pool';
import { authenticate, authorize, HR_LEVEL } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { asyncHandler, offsetOf, ok, pageMeta, paginationSchema } from '../../utils/http';

const listQuery = paginationSchema.extend({ action: z.string().trim().max(60).optional(), search: z.string().trim().max(100).optional() });

export const auditRouter = Router();
auditRouter.use(authenticate, authorize(...HR_LEVEL));

auditRouter.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (_req, res) => {
    const query = res.locals.query as z.infer<typeof listQuery>;
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.action) {
      params.push(query.action);
      where.push(`l.action = $${params.length}`);
    }
    if (query.search) {
      params.push(`%${query.search}%`);
      where.push(`(u.full_name ILIKE $${params.length} OR l.action ILIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const from = 'FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id';
    const total = await db.query(`SELECT count(*)::int AS total ${from} ${whereSql}`, params);
    const { rows } = await db.query(
      `SELECT l.id, l.action, l.entity_type AS "entityType", l.entity_id AS "entityId", l.details,
              l.ip_address AS "ipAddress", l.created_at AS "createdAt", u.id AS "actorId", u.full_name AS "actorName"
         ${from} ${whereSql} ORDER BY l.created_at DESC, l.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offsetOf(query.page, query.pageSize)],
    );
    ok(res, rows, pageMeta(query.page, query.pageSize, total.rows[0].total));
  }),
);

auditRouter.get(
  '/actions',
  asyncHandler(async (_req, res) => {
    const { rows } = await db.query('SELECT DISTINCT action FROM audit_logs ORDER BY action');
    ok(res, rows.map((r) => r.action));
  }),
);
