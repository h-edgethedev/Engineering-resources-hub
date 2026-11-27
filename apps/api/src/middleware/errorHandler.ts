import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { ApiError } from '../errors/ApiError.js';

function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return new ApiError(413, 'RESOURCE_FILE_TOO_LARGE', 'The uploaded file exceeds the configured size limit.');
    return new ApiError(400, 'INVALID_MULTIPART_REQUEST', 'The upload must contain one file and valid metadata fields.');
  }

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
    console.error(JSON.stringify({
      level: 'error',
      event: 'http_request_failed',
      requestId: request.requestId,
      method: request.method,
      path: request.path,
      statusCode: apiError.statusCode,
      errorCode: apiError.code,
      errorType: error instanceof Error ? error.name : typeof error,
    }));
  }

  response.status(apiError.statusCode).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(request.requestId ? { requestId: request.requestId } : {}),
      ...(apiError.details === undefined ? {} : { details: apiError.details }),
    },
  });
};
