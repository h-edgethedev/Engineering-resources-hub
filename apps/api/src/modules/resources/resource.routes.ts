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
import { requireAnyRole, requireAuth } from '../auth/auth.middleware.js';
import { moderationSchema } from '../auth/auth.schemas.js';
import { moderateResourceController } from './resource.controller.js';

export const resourceRouter = Router();

resourceRouter.get('/', listResourcesController);
resourceRouter.post('/', requireAuth, requireAnyRole('STUDENT', 'CONTRIBUTOR'), resourceUpload, createResourceController);
resourceRouter.post('/:resourceId/moderation', requireAuth, requireAnyRole('SUPER_ADMIN', 'MODERATOR', 'UNIVERSITY_ADMIN'), validateRequest({ params: resourceIdParamsSchema, body: moderationSchema }), moderateResourceController);
resourceRouter.get('/:resourceId/file', validateRequest({ params: resourceIdParamsSchema }), resourceFileController('inline'));
resourceRouter.get('/:resourceId/file/download', validateRequest({ params: resourceIdParamsSchema }), resourceFileController('attachment'));
resourceRouter.get('/:resourceId', validateRequest({ params: resourceIdParamsSchema }), getResourceController);
resourceRouter.patch('/:resourceId', requireAuth, validateRequest({ params: resourceIdParamsSchema }), updateResourceController);
resourceRouter.delete('/:resourceId', requireAuth, validateRequest({ params: resourceIdParamsSchema }), deleteResourceController);
