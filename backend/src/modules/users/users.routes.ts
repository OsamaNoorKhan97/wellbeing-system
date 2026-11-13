import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, currentUser } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { ipOf } from '../../services/audit.service';
import { asyncHandler, created, ok, pageMeta, paginationSchema, parseId } from '../../utils/http';
import { passwordRule } from '../../utils/password';
import * as users from './users.service';

const roleSchema = z.enum(['EMPLOYEE', 'LINE_MANAGER', 'HR_ADMIN']);

const listQuery = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  role: roleSchema.optional(),
  status: z.enum(['active', 'inactive']).optional(),
  department: z.string().trim().max(100).optional(),
  assignment: z.enum(['assigned', 'unassigned']).optional(),
});

const createBody = z.object({
  fullName: z.string().trim().min(2).max(120),
  employeeId: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens or underscores only'),
  email: z.string().trim().email().max(254),
  role: roleSchema,
  department: z.string().trim().max(100).optional(),
  designation: z.string().trim().max(100).optional(),
  password: z.string().max(128).refine(passwordRule.test, passwordRule.description),
});

export const usersRouter = Router();
usersRouter.use(authenticate, authorize('HR_ADMIN'));

usersRouter.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (_req, res) => {
    const query = res.locals.query as z.infer<typeof listQuery>;
    const { items, total } = await users.listUsers(query);
    ok(res, items, pageMeta(query.page, query.pageSize, total));
  }),
);

usersRouter.get('/departments', asyncHandler(async (_req, res) => ok(res, await users.listDepartments())));

usersRouter.post(
  '/',
  validate({ body: createBody }),
  asyncHandler(async (req, res) => created(res, await users.createUser(currentUser(req), req.body, ipOf(req)))),
);

usersRouter.get('/:id', asyncHandler(async (req, res) => ok(res, await users.getUserDetail(parseId(req.params.id)))));

usersRouter.patch(
  '/:id/status',
  validate({ body: z.object({ isActive: z.boolean() }) }),
  asyncHandler(async (req, res) =>
    ok(res, await users.setUserStatus(currentUser(req), parseId(req.params.id), req.body.isActive, ipOf(req))),
  ),
);

usersRouter.patch(
  '/:id/role',
  validate({ body: z.object({ role: roleSchema }) }),
  asyncHandler(async (req, res) =>
    ok(res, await users.setUserRole(currentUser(req), parseId(req.params.id), req.body.role, ipOf(req))),
  ),
);
