import type { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { db } from '../db/pool';
import { asyncHandler, forbidden, unauthorized } from '../utils/http';

export type Role = 'EMPLOYEE' | 'LINE_MANAGER' | 'HR_ADMIN';

export interface AuthUser {
  id: number;
  role: Role;
  fullName: string;
  email: string;
}

interface TokenPayload {
  sub: string;
  tv: number;
}

export function signAccessToken(userId: number, tokenVersion: number, rememberMe: boolean): { token: string; expiresIn: string } {
  const expiresIn = rememberMe ? env.JWT_REMEMBER_EXPIRES_IN : env.JWT_EXPIRES_IN;
  const token = jwt.sign({ sub: String(userId), tv: tokenVersion }, env.JWT_SECRET, { expiresIn } as jwt.SignOptions);
  return { token, expiresIn };
}

/**
 * Verifies the bearer token and reloads the user on every request, so a
 * deactivated account, a role change or a password reset takes effect immediately.
 */
export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw unauthorized();

  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as unknown as TokenPayload;
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.');
  }

  const { rows } = await db.query(
    `SELECT u.id, u.full_name AS "fullName", u.email, u.is_active AS "isActive",
            u.token_version AS "tokenVersion", r.name AS role
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1`,
    [Number(payload.sub)],
  );
  const user = rows[0];
  if (!user || user.tokenVersion !== payload.tv) throw unauthorized('Your session is no longer valid. Please sign in again.');
  if (!user.isActive) throw forbidden('Your account has been deactivated. Please contact HR.');

  req.user = { id: user.id, role: user.role, fullName: user.fullName, email: user.email };
  next();
});

export const authorize =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
