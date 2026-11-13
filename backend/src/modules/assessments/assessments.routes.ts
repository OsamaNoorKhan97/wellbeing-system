import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, currentUser } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { ipOf } from '../../services/audit.service';
import { asyncHandler, created, ok, pageMeta, paginationSchema } from '../../utils/http';
import * as assessments from './assessments.service';

const rating = z.number({ required_error: 'Please select a rating', invalid_type_error: 'Please select a rating' }).int().min(1).max(5);
const submitBody = z.object({ mood: rating, stress: rating, energy: rating });

// Individual check-ins are visible to the employee who made them and to nobody else.
export const assessmentsRouter = Router();
assessmentsRouter.use(authenticate, authorize('EMPLOYEE'));

assessmentsRouter.get('/status', asyncHandler(async (req, res) => ok(res, await assessments.getAssessmentStatus(currentUser(req).id))));

assessmentsRouter.get(
  '/',
  validate({ query: paginationSchema }),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = res.locals.query as z.infer<typeof paginationSchema>;
    const { items, total } = await assessments.listOwnAssessments(currentUser(req).id, page, pageSize);
    ok(res, items, pageMeta(page, pageSize, total));
  }),
);

assessmentsRouter.post(
  '/',
  validate({ body: submitBody }),
  asyncHandler(async (req, res) => created(res, await assessments.submitAssessment(currentUser(req), req.body, ipOf(req)))),
);
