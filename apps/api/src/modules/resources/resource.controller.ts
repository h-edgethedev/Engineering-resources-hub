import type { RequestHandler } from 'express';
import { rm } from 'node:fs/promises';
import { basename } from 'node:path';
import { ApiError } from '../../errors/ApiError.js';
import {
  createResourceSchema,
  listResourcesQuerySchema,
  trashReasonSchema,
  updateResourceSchema,
} from './resource.schemas.js';
import {
  createResource,
  findResourceById,
  findResourceFile,
  listResources,
  moderateResource,
} from './resource.service.js';
import { editResourceMetadata, moveResourceToTrash, replaceResourceFile } from './governance.service.js';
import { moderationSchema } from '../auth/auth.schemas.js';

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
    const result = await listResources(parsed.data, request.auth);
    response.json({ data: result.items, meta: result.meta });
  } catch (error) { next(error); }
};

export const getResourceController: RequestHandler = async (request, response, next) => {
  try {
    const resource = await findResourceById(resourceId(request), request.auth);
    if (!resource) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
    response.json({ data: resource });
  } catch (error) { next(error); }
};

export const createResourceController: RequestHandler = async (request, response, next) => {
  const file = request.file;
  try {
    if (!request.auth) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to upload a resource.');
    if (!file) throw new ApiError(400, 'RESOURCE_FILE_REQUIRED', 'Upload one file using the multipart field named "file".');
    const parsed = createResourceSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.issues);
    const resource = await createResource(parsed.data, file, request.auth);
    response.status(201).json({ data: resource });
  } catch (error) { next(error); }
  finally { if (file?.path) await rm(file.path, { force: true }).catch(() => undefined); }
};

export function resourceFileController(disposition: 'inline' | 'attachment'): RequestHandler {
  return async (request, response, next) => {
    try {
      const file = await findResourceFile(resourceId(request), request.auth);
      const safeFilename = basename(file.originalFilename).replace(/[\r\n"\\]/g, '_');
      response.setHeader('Content-Type', file.mediaType);
      response.setHeader('Content-Disposition', `${disposition}; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(file.originalFilename)}`);
      response.setHeader('X-Content-Type-Options', 'nosniff');
      const stream = file.stream;
      stream.on('error', (error) => {
        if (response.headersSent) response.destroy(error);
        else next(new ApiError(404, 'RESOURCE_FILE_NOT_FOUND', 'The resource file was not found.'));
      });
      stream.pipe(response);
    } catch (error) { next(error); }
  };
}

export const updateResourceController: RequestHandler = async (request, response, next) => {
  try {
    const parsed = updateResourceSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.issues);
    if (!request.auth) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to update a resource.');
    const resource = await editResourceMetadata(resourceId(request), parsed.data, request.auth);
    response.json({ data: resource });
  } catch (error) { next(error); }
};

export const deleteResourceController: RequestHandler = async (request, response, next) => {
  try {
    if (!request.auth) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to remove a resource.');
    const parsed = trashReasonSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.issues);
    const resource = await moveResourceToTrash(resourceId(request), parsed.data.reason, request.auth);
    response.json({ data: resource });
  } catch (error) { next(error); }
};

export const replaceResourceFileController: RequestHandler = async (request, response, next) => {
  const file = request.file;
  try {
    if (!request.auth) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to replace a resource file.');
    if (!file) throw new ApiError(400, 'RESOURCE_FILE_REQUIRED', 'Upload one file using the multipart field named "file".');
    response.json({ data: await replaceResourceFile(resourceId(request), file, request.auth) });
  } catch (error) { next(error); }
  finally { if (file?.path) await rm(file.path, { force: true }).catch(() => undefined); }
};

export const moderateResourceController: RequestHandler = async (request, response, next) => {
  try {
    if (!request.auth) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to moderate a resource.');
    const parsed = moderationSchema.safeParse(request.body);
    if (!parsed.success) throw validationError(parsed.error.issues);
    const resource = await moderateResource(resourceId(request), parsed.data.action, parsed.data.reason, request.auth);
    response.json({ data: resource });
  } catch (error) { next(error); }
};
