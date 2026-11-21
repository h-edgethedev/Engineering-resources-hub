import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest.js';
import { resourceIdParamsSchema } from './resource.schemas.js';
import {
  createResourceController,
  deleteResourceController,
  getResourceController,
  listResourcesController,
  resourceFileController,
  updateResourceController,
} from './resource.controller.js';
import { resourceUpload } from './upload.middleware.js';

export const resourceRouter = Router();

resourceRouter.get('/', listResourcesController);
resourceRouter.post('/', resourceUpload, createResourceController);
resourceRouter.get('/:resourceId/file', validateRequest({ params: resourceIdParamsSchema }), resourceFileController('inline'));
resourceRouter.get('/:resourceId/file/download', validateRequest({ params: resourceIdParamsSchema }), resourceFileController('attachment'));
resourceRouter.get('/:resourceId', validateRequest({ params: resourceIdParamsSchema }), getResourceController);
resourceRouter.patch('/:resourceId', validateRequest({ params: resourceIdParamsSchema }), updateResourceController);
resourceRouter.delete('/:resourceId', validateRequest({ params: resourceIdParamsSchema }), deleteResourceController);
