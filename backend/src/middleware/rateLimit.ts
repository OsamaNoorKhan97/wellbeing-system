import type { RequestHandler } from 'express';
import { AppError } from '../utils/http';

/** Small fixed-window limiter for the authentication endpoints. Swap for a Redis-backed one when running several API instances. */
export function rateLimit(options: { windowMs: number; max: number }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 10_000) {
      for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    }
    const key = `${req.ip}:${req.path}`;
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > options.max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return next(new AppError(429, 'TOO_MANY_REQUESTS', 'Too many attempts. Please wait a few minutes and try again.'));
    }
    next();
  };
}
