import type { ErrorRequestHandler } from 'express';
import { ApiError } from '../errors/ApiError.js';

function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.parse.failed') {
      return new ApiError(400, 'INVALID_JSON_BODY', 'Request body must contain valid JSON.');
    }
    if (error.type === 'entity.too.large') {
      return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the allowed size.');
    }
  }

  return new ApiError(500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred.');
}

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const apiError = normalizeError(error);

  if (apiError.statusCode >= 500) {
    console.error(`${request.method} ${request.path} failed (${apiError.code}).`);
  }

  response.status(apiError.statusCode).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details === undefined ? {} : { details: apiError.details }),
    },
  });
};
