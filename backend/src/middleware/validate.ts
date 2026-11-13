import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../utils/http';

/**
 * Validates and replaces req.body; the parsed query string is exposed on
 * res.locals.query (req.query is read-only in newer Express versions).
 */
export const validate =
  (schemas: { body?: ZodTypeAny; query?: ZodTypeAny }): RequestHandler =>
  (req, res, next) => {
    for (const part of ['body', 'query'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        const details = result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
        return next(new AppError(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields', details));
      }
      if (part === 'body') req.body = result.data;
      else res.locals.query = result.data;
    }
    next();
  };
