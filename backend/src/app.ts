import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { alertsRouter } from './modules/alerts/alerts.routes';
import { analyticsRouter } from './modules/analytics/analytics.routes';
import { assessmentsRouter } from './modules/assessments/assessments.routes';
import { assignmentsRouter } from './modules/assignments/assignments.routes';
import { auditRouter } from './modules/audit/audit.routes';
import { authRouter } from './modules/auth/auth.routes';
import { employeesRouter } from './modules/employees/employees.routes';
import { managersRouter } from './modules/managers/managers.routes';
import { meetingsRouter } from './modules/meetings/meetings.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { requestsRouter } from './modules/requests/requests.routes';
import { settingsRouter } from './modules/settings/settings.routes';
import { surveysRouter } from './modules/surveys/surveys.routes';
import { usersRouter } from './modules/users/users.routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // upgrade-insecure-requests is dropped so the bundled frontend also works over plain HTTP on an internal network.
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
  app.use(cors({ origin: env.corsOrigins, credentials: false }));
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } });
  });
  api.use('/auth', authRouter);
  api.use('/users', usersRouter);
  api.use('/assignments', assignmentsRouter);
  api.use('/employees', employeesRouter);
  api.use('/managers', managersRouter);
  api.use('/assessments', assessmentsRouter);
  api.use('/surveys', surveysRouter);
  api.use('/requests', requestsRouter);
  api.use('/meetings', meetingsRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/settings', settingsRouter);
  api.use('/analytics', analyticsRouter);
  api.use('/audit-logs', auditRouter);
  api.use('/alerts', alertsRouter);
  api.use(notFoundHandler);
  app.use('/api/v1', api);

  // Optional single-process deployment: serve the built frontend and let the SPA handle its own routes.
  const frontendDir = env.FRONTEND_DIST ? path.resolve(env.FRONTEND_DIST) : null;
  if (frontendDir && fs.existsSync(path.join(frontendDir, 'index.html'))) {
    app.use(express.static(frontendDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(frontendDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
