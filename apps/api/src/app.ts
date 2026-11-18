import express, { type Express } from 'express';
import type { HealthResponse } from '@erh/shared';

export function createApp(): Express {
  const app = express();

  app.get('/health', (_request, response) => {
    const body: HealthResponse = {
      status: 'ok',
      service: 'engineering-resources-hub-api',
    };
    response.json(body);
  });

  return app;
}
