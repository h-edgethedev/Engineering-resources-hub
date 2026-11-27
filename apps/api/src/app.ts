import cors from 'cors';
import express, { type Express } from 'express';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { checkDatabaseConnection } from './modules/health/health.service.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { apiRouter } from './routes/index.js';
import { requireCsrf } from './modules/auth/auth.middleware.js';
import { attachSession } from './modules/auth/auth.middleware.js';
import { randomUUID } from 'node:crypto';

export interface AppDependencies {
  databaseHealthCheck?: () => Promise<void>;
}

export function createApp(dependencies: AppDependencies = {}): Express {
  const app = express();
  const databaseHealthCheck = dependencies.databaseHealthCheck ?? checkDatabaseConnection;

  app.disable('x-powered-by');
  app.use((request, response, next) => {
    request.requestId = randomUUID();
    response.setHeader('X-Request-Id', request.requestId);
    next();
  });
  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use(cors({ origin: env.webOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/health', createHealthRouter(databaseHealthCheck));
  app.use('/api/v1', attachSession, (request, response, next) => {
    const preAuthMutation = ['/auth/login', '/auth/register', '/auth/verify-email', '/auth/resend-verification'].includes(request.path);
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && request.auth && !preAuthMutation) {
      requireCsrf(request, response, next);
      return;
    }
    next();
  }, apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
