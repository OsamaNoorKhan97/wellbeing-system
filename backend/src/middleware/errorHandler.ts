import type { ErrorRequestHandler, RequestHandler } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/http';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} does not exist`));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.status).json({
      success: false,
      error: { code: error.code, message: error.message, ...(error.details !== undefined ? { details: error.details } : {}) },
    });
    return;
  }
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Request body is not valid JSON' } });
    return;
  }
  if (error?.code === '23505') {
    res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'A record with these details already exists' } });
    return;
  }
  if (!env.isTest) console.error(error);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' },
  });
};
