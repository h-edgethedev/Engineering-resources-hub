import express, { type Express } from 'express';
import type { HealthResponse } from '@erh/shared';
import { academicRouter } from './modules/academics/academic.routes.js';

export function createApp(): Express {
  const app = express();

  app.get('/health', (_request, response) => {
    const body: HealthResponse = {
      status: 'ok',
      service: 'engineering-resources-hub-api',
    };
    response.json(body);
  });

  app.use('/api/v1', academicRouter);

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled API error.', error);
    response.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' },
    });
  });

  return app;
}
