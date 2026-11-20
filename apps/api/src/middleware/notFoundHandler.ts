import type { RequestHandler } from 'express';
import { ApiError } from '../errors/ApiError.js';

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new ApiError(404, 'ROUTE_NOT_FOUND', `No route matches ${request.method} ${request.path}.`));
};
