import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, currentUser } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { ipOf } from '../../services/audit.service';
import { asyncHandler, created, ok, pageMeta, paginationSchema, parseId } from '../../utils/http';
import * as surveys from './surveys.service';

const questionBody = z.object({
  text: z.string().trim().min(10, 'Write the full question (at least 10 characters)').max(500),
  category: z.string().trim().min(2, 'Category is required').max(100),
  displayOrder: z.coerce.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
});

const submitBody = z.object({
  answers: z
    .array(z.object({ questionId: z.number().int().positive(), rating: z.number().int().min(1).max(5) }))
    .max(200),
});

export const surveysRouter = Router();
surveysRouter.use(authenticate);

surveysRouter.get(
  '/questions',
  authorize('EMPLOYEE', 'HR_ADMIN'),
  asyncHandler(async (req, res) => {
    const includeInactive = currentUser(req).role === 'HR_ADMIN' && req.query.includeInactive === 'true';
    ok(res, await surveys.listQuestions(includeInactive));
  }),
);

surveysRouter.post(
  '/questions',
  authorize('HR_ADMIN'),
  validate({ body: questionBody }),
  asyncHandler(async (req, res) => created(res, await surveys.createQuestion(currentUser(req), req.body, ipOf(req)))),
);

surveysRouter.patch(
  '/questions/:id',
  authorize('HR_ADMIN'),
  validate({ body: questionBody.partial().refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' }) }),
  asyncHandler(async (req, res) => ok(res, await surveys.updateQuestion(currentUser(req), parseId(req.params.id), req.body, ipOf(req)))),
);

surveysRouter.get('/status', authorize('EMPLOYEE'), asyncHandler(async (req, res) => ok(res, await surveys.getSurveyStatus(currentUser(req).id))));

surveysRouter.get(
  '/submissions',
  authorize('EMPLOYEE'),
  validate({ query: paginationSchema }),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = res.locals.query as z.infer<typeof paginationSchema>;
    const { items, total } = await surveys.listOwnSubmissions(currentUser(req).id, page, pageSize);
    ok(res, items, pageMeta(page, pageSize, total));
  }),
);

surveysRouter.post(
  '/submissions',
  authorize('EMPLOYEE'),
  validate({ body: submitBody }),
  asyncHandler(async (req, res) => created(res, await surveys.submitSurvey(currentUser(req), req.body.answers, ipOf(req)))),
);
