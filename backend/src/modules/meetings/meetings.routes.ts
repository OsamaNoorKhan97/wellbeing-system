import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, currentUser } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { ipOf } from '../../services/audit.service';
import { asyncHandler, created, ok, pageMeta, paginationSchema, parseId } from '../../utils/http';
import * as meetings from './meetings.service';

export const meetingFields = {
  scheduledAt: z.coerce.date({ errorMap: () => ({ message: 'Enter a valid date and time' }) }),
  durationMinutes: z.coerce.number().int().min(5).max(480).default(30),
  purpose: z.string().trim().max(1000).nullish(),
  location: z.string().trim().max(200).nullish(),
};

const createBody = z.object({ employeeId: z.coerce.number().int().positive(), ...meetingFields });
const updateBody = z
  .object({ ...meetingFields, durationMinutes: z.coerce.number().int().min(5).max(480) })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' });
const listQuery = paginationSchema.extend({ scope: z.enum(['upcoming', 'past', 'all']).default('upcoming') });

export const meetingsRouter = Router();
meetingsRouter.use(authenticate, authorize('EMPLOYEE', 'LINE_MANAGER'));

meetingsRouter.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as z.infer<typeof listQuery>;
    const { items, total } = await meetings.listMeetings(currentUser(req), query);
    ok(res, items, pageMeta(query.page, query.pageSize, total));
  }),
);

meetingsRouter.post(
  '/',
  authorize('LINE_MANAGER'),
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    const { employeeId, ...input } = req.body;
    created(res, await meetings.scheduleMeeting(currentUser(req), employeeId, input, ipOf(req)));
  }),
);

meetingsRouter.patch(
  '/:id',
  authorize('LINE_MANAGER'),
  validate({ body: updateBody }),
  asyncHandler(async (req, res) => ok(res, await meetings.updateMeeting(currentUser(req), parseId(req.params.id), req.body, ipOf(req)))),
);

meetingsRouter.post(
  '/:id/cancel',
  authorize('LINE_MANAGER'),
  validate({ body: z.object({ reason: z.string().trim().max(500).nullish() }) }),
  asyncHandler(async (req, res) =>
    ok(res, await meetings.cancelMeeting(currentUser(req), parseId(req.params.id), req.body.reason || null, ipOf(req))),
  ),
);

meetingsRouter.post(
  '/:id/complete',
  authorize('LINE_MANAGER'),
  asyncHandler(async (req, res) => ok(res, await meetings.completeMeeting(currentUser(req), parseId(req.params.id), ipOf(req)))),
);
