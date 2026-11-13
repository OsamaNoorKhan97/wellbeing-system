import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, currentUser } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { ipOf } from '../../services/audit.service';
import { asyncHandler, ok, parseId } from '../../utils/http';
import * as assignments from './assignments.service';

export const assignmentsRouter = Router();
assignmentsRouter.use(authenticate, authorize('HR_ADMIN'));

assignmentsRouter.get('/', asyncHandler(async (_req, res) => ok(res, await assignments.listAssignmentsByManager())));

assignmentsRouter.put(
  '/:employeeId',
  validate({ body: z.object({ managerId: z.coerce.number().int().positive() }) }),
  asyncHandler(async (req, res) =>
    ok(res, await assignments.assignManager(currentUser(req), parseId(req.params.employeeId, 'employee id'), req.body.managerId, ipOf(req))),
  ),
);

assignmentsRouter.delete(
  '/:employeeId',
  asyncHandler(async (req, res) =>
    ok(res, await assignments.removeAssignment(currentUser(req), parseId(req.params.employeeId, 'employee id'), ipOf(req))),
  ),
);
