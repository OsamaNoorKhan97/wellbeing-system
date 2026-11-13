import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { authenticate, currentUser } from '../../middleware/authenticate';
import { rateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { ipOf } from '../../services/audit.service';
import { asyncHandler, created, ok } from '../../utils/http';
import { passwordRule } from '../../utils/password';
import { findUserById } from '../users/users.service';
import * as auth from './auth.service';

const password = z.string().max(128).refine(passwordRule.test, passwordRule.description);
const passwordsMatch = (data: { password: string; confirmPassword: string }) => data.password === data.confirmPassword;
const mismatch = { message: 'Passwords do not match', path: ['confirmPassword'] };

const registerBody = z
  .object({
    fullName: z.string().trim().min(2, 'Full name is required').max(120),
    employeeId: z
      .string()
      .trim()
      .min(2, 'Employee ID is required')
      .max(30)
      .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens or underscores only'),
    email: z.string().trim().email('Enter a valid email address').max(254),
    department: z.string().trim().min(2, 'Department is required').max(100),
    designation: z.string().trim().min(2, 'Designation is required').max(100),
    password,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, mismatch);

const loginBody = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or Employee ID').max(254),
  password: z.string().min(1, 'Enter your password').max(128),
  rememberMe: z.boolean().optional().default(false),
});

const resetBody = z.object({ token: z.string().min(10), password, confirmPassword: z.string() }).refine(passwordsMatch, mismatch);

const changePasswordBody = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password'), password, confirmPassword: z.string() })
  .refine(passwordsMatch, mismatch);

const profileBody = z.object({
  fullName: z.string().trim().min(2).max(120),
  department: z.string().trim().min(2).max(100).optional(),
  designation: z.string().trim().min(2).max(100).optional(),
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: env.isTest ? 10_000 : env.AUTH_RATE_LIMIT_MAX });

export const authRouter = Router();

authRouter.post(
  '/register',
  authLimiter,
  validate({ body: registerBody }),
  asyncHandler(async (req, res) => created(res, await auth.registerEmployee(req.body, ipOf(req)))),
);

authRouter.post(
  '/login',
  authLimiter,
  validate({ body: loginBody }),
  asyncHandler(async (req, res) => ok(res, await auth.login(req.body.identifier, req.body.password, req.body.rememberMe, ipOf(req)))),
);

authRouter.post(
  '/forgot-password',
  authLimiter,
  validate({ body: z.object({ identifier: z.string().trim().min(1, 'Enter your email or Employee ID').max(254) }) }),
  asyncHandler(async (req, res) => {
    const result = await auth.requestPasswordReset(req.body.identifier, ipOf(req));
    ok(res, { message: 'If an account matches, password reset instructions have been sent.', ...result });
  }),
);

authRouter.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetBody }),
  asyncHandler(async (req, res) => {
    await auth.resetPassword(req.body.token, req.body.password, ipOf(req));
    ok(res, { message: 'Your password has been reset. You can now sign in.' });
  }),
);

authRouter.get('/me', authenticate, asyncHandler(async (req, res) => ok(res, await findUserById(currentUser(req).id))));

authRouter.patch(
  '/me',
  authenticate,
  validate({ body: profileBody }),
  asyncHandler(async (req, res) => ok(res, await auth.updateOwnProfile(currentUser(req), req.body))),
);

authRouter.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordBody }),
  asyncHandler(async (req, res) =>
    ok(res, await auth.changePassword(currentUser(req), req.body.currentPassword, req.body.password, ipOf(req))),
  ),
);
