import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest.js';
import { resourceIdParamsSchema } from './resource.schemas.js';
import {
  createResourceController,
  deleteResourceController,
  getResourceController,
  listResourcesController,
  updateResourceController,
} from './resource.controller.js';

export const resourceRouter = Router();

resourceRouter.get('/', listResourcesController);
resourceRouter.post('/', createResourceController);
resourceRouter.get('/:resourceId', validateRequest({ params: resourceIdParamsSchema }), getResourceController);
resourceRouter.patch('/:resourceId', validateRequest({ params: resourceIdParamsSchema }), updateResourceController);
resourceRouter.delete('/:resourceId', validateRequest({ params: resourceIdParamsSchema }), deleteResourceController);
