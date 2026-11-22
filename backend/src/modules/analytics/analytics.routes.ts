import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, HR_LEVEL } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { asyncHandler, ok } from '../../utils/http';
import * as analytics from './analytics.service';

export const analyticsRouter = Router();
analyticsRouter.use(authenticate, authorize(...HR_LEVEL));

analyticsRouter.get('/summary', asyncHandler(async (_req, res) => ok(res, await analytics.getSummary())));

analyticsRouter.get(
  '/trends',
  validate({ query: z.object({ days: z.coerce.number().int().min(7).max(180).default(30) }) }),
  asyncHandler(async (_req, res) => ok(res, await analytics.getTrends(res.locals.query.days))),
);

analyticsRouter.get('/survey', asyncHandler(async (_req, res) => ok(res, await analytics.getSurveyAnalytics())));
