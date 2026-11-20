import type { RequestHandler } from 'express';
import { ApiError } from '../../errors/ApiError.js';
import {
  createResourceSchema,
  listResourcesQuerySchema,
  updateResourceSchema,
} from './resource.schemas.js';
import {
  createResource,
  deleteResource,
  findResourceById,
  listResources,
  updateResource,
} from './resource.service.js';

function resourceId(request: Parameters<RequestHandler>[0]): string {
  const value = request.params.resourceId;
  if (typeof value !== 'string') throw new ApiError(400, 'INVALID_ROUTE_PARAMETER', 'A required route parameter is invalid.');
  return value;
}

function validationError(issues: Array<{ path: PropertyKey[]; message: string }>): ApiError {
  return new ApiError(400, 'VALIDATION_ERROR', 'Request data is invalid.', issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
}

export const listResourcesController: RequestHandler = async (request, response, next) => {
  try {
    const parsed = listResourcesQuerySchema.safeParse(request.query);
    if (!parsed.success) throw validationError(parsed.error.issues);
    const result = await listResources(parsed.data);
    response.json({ data: result.items, meta: result.meta });
  } catch (error) { next(error); }
};

export const getResourceController: RequestHandler = async (request, response, next) => {
  try {
    const resource = await findResourceById(resourceId(request));
    if (!resource) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
    response.json({ data: resource });
  } catch (error) { next(error); }
};

export const createResourceController: RequestHandler = async (request, response, next) => {
  try {
    const parsed = createResourceSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.issues);
    const resource = await createResource(parsed.data);
    response.status(201).json({ data: resource });
  } catch (error) { next(error); }
};

export const updateResourceController: RequestHandler = async (request, response, next) => {
  try {
    const parsed = updateResourceSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.issues);
    const resource = await updateResource(resourceId(request), parsed.data);
    response.json({ data: resource });
  } catch (error) { next(error); }
};

export const deleteResourceController: RequestHandler = async (request, response, next) => {
  try {
    await deleteResource(resourceId(request));
    response.status(204).end();
  } catch (error) { next(error); }
};
