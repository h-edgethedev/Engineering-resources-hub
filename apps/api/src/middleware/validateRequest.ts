import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from '../errors/ApiError.js';

type RequestPart = 'body' | 'params' | 'query';
type RequestSchemas = Partial<Record<RequestPart, ZodType>>;

export function validateRequest(schemas: RequestSchemas): RequestHandler {
  return (request, _response, next) => {
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;

      const parsed = schema.safeParse(request[part]);
      if (!parsed.success) {
        next(new ApiError(
          400,
          'VALIDATION_ERROR',
          'Request data is invalid.',
          parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        ));
        return;
      }
    }

    next();
  };
}
