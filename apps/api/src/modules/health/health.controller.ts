import type { RequestHandler } from 'express';
import type { HealthResponse } from '@erh/shared';
import { ApiError } from '../../errors/ApiError.js';

export type DatabaseHealthCheck = () => Promise<void>;

export function createHealthControllers(databaseHealthCheck: DatabaseHealthCheck) {
  const live: RequestHandler = (_request, response) => {
    const body: HealthResponse = {
      status: 'ok',
      service: 'engineering-resources-hub-api',
    };
    response.json({ data: body });
  };

  const ready: RequestHandler = async (_request, response, next) => {
    try {
      await databaseHealthCheck();
      response.json({ data: { status: 'ready', checks: { database: 'ok' } } });
    } catch {
      next(new ApiError(
        503,
        'SERVICE_UNAVAILABLE',
        'The API is not ready to serve requests.',
        { database: 'unavailable' },
      ));
    }
  };

  return { live, ready };
}
