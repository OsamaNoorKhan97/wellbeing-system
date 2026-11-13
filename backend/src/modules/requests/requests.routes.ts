import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, currentUser } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { ipOf } from '../../services/audit.service';
import { asyncHandler, created, ok, pageMeta, paginationSchema, parseId } from '../../utils/http';
import { meetingFields } from '../meetings/meetings.routes';
import * as requests from './requests.service';

const typeSchema = z.enum(['BREAK', 'DISCUSSION']);
const createBody = z.object({ type: typeSchema, reason: z.string().trim().max(1000).nullish() });
const decisionBody = z.object({ comment: z.string().trim().max(1000).nullish() });
const listQuery = paginationSchema.extend({
  type: typeSchema.optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED']).optional(),
});

// HR/Admin deliberately has no access to individual requests; it sees request volumes through analytics only.
export const requestsRouter = Router();
requestsRouter.use(authenticate, authorize('EMPLOYEE', 'LINE_MANAGER'));

requestsRouter.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as z.infer<typeof listQuery>;
    const { items, total } = await requests.listRequests(currentUser(req), query);
    ok(res, items, pageMeta(query.page, query.pageSize, total));
  }),
);

requestsRouter.post(
  '/',
  authorize('EMPLOYEE'),
  validate({ body: createBody }),
  asyncHandler(async (req, res) =>
    created(res, await requests.createRequest(currentUser(req), req.body.type, req.body.reason || null, ipOf(req))),
  ),
);

requestsRouter.get('/:id', asyncHandler(async (req, res) => ok(res, await requests.getRequest(currentUser(req), parseId(req.params.id)))));

for (const [path, approve] of [['approve', true], ['reject', false]] as const) {
  requestsRouter.post(
    `/:id/${path}`,
    authorize('LINE_MANAGER'),
    validate({ body: decisionBody }),
    asyncHandler(async (req, res) =>
      ok(res, await requests.decideBreakRequest(currentUser(req), parseId(req.params.id), approve, req.body.comment || null, ipOf(req))),
    ),
  );
}

requestsRouter.post(
  '/:id/schedule',
  authorize('LINE_MANAGER'),
  validate({ body: z.object(meetingFields) }),
  asyncHandler(async (req, res) =>
    ok(res, await requests.scheduleDiscussion(currentUser(req), parseId(req.params.id), req.body, ipOf(req))),
  ),
);

requestsRouter.post(
  '/:id/cancel',
  authorize('EMPLOYEE'),
  asyncHandler(async (req, res) => ok(res, await requests.cancelOwnRequest(currentUser(req), parseId(req.params.id), ipOf(req)))),
);
