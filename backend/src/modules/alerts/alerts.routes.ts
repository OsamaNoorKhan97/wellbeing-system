import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, currentUser, HR_LEVEL } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { ipOf } from '../../services/audit.service';
import { asyncHandler, ok, pageMeta, paginationSchema, parseId } from '../../utils/http';
import * as alerts from './alerts.service';

const listQuery = paginationSchema.extend({
  status: z.enum(['open', 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'all']).default('open'),
});
const commentField = z.string().trim().min(1, 'Write a comment').max(1000);
const optionalComment = z.object({ comment: z.string().trim().max(1000).nullish() });

// Line Managers see the alerts of their own team; HR and the Super Admin see every alert.
export const alertsRouter = Router();
alertsRouter.use(authenticate, authorize('LINE_MANAGER', ...HR_LEVEL));

alertsRouter.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as z.infer<typeof listQuery>;
    const { items, total } = await alerts.listAlerts(currentUser(req), query);
    ok(res, items, pageMeta(query.page, query.pageSize, total));
  }),
);

alertsRouter.get('/open-count', asyncHandler(async (req, res) => ok(res, { open: await alerts.countOpenAlerts(currentUser(req)) })));

alertsRouter.get('/:id', asyncHandler(async (req, res) => ok(res, await alerts.getAlert(currentUser(req), parseId(req.params.id)))));

alertsRouter.post(
  '/:id/acknowledge',
  validate({ body: optionalComment }),
  asyncHandler(async (req, res) =>
    ok(res, await alerts.acknowledgeAlert(currentUser(req), parseId(req.params.id), req.body.comment || null, ipOf(req))),
  ),
);

alertsRouter.post(
  '/:id/resolve',
  validate({ body: optionalComment }),
  asyncHandler(async (req, res) =>
    ok(res, await alerts.resolveAlert(currentUser(req), parseId(req.params.id), req.body.comment || null, ipOf(req))),
  ),
);

alertsRouter.post(
  '/:id/comments',
  validate({ body: z.object({ comment: commentField }) }),
  asyncHandler(async (req, res) =>
    ok(res, await alerts.commentOnAlert(currentUser(req), parseId(req.params.id), req.body.comment, ipOf(req))),
  ),
);
