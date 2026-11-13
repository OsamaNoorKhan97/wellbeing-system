import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details);

/** Every successful response has the shape { success: true, data, meta? }. */
export function ok(res: Response, data: unknown, meta?: Record<string, unknown>) {
  return res.status(200).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function created(res: Response, data: unknown) {
  return res.status(201).json({ success: true, data });
}

export const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    handler(req, res, next).catch(next);
  };

export function parseId(value: string | undefined, name = 'id'): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest(`Invalid ${name}`);
  return id;
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export const pageMeta = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

export const offsetOf = (page: number, pageSize: number) => (page - 1) * pageSize;
