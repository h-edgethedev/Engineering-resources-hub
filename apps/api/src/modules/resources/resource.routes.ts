import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest.js';
import { resourceIdParamsSchema, requestIdParamsSchema } from './resource.schemas.js';
import {
  createResourceController, deleteResourceController, getResourceController, listResourcesController,
  replaceResourceFileController, resourceFileController, updateResourceController,
} from './resource.controller.js';
import { resourceUpload } from './upload.middleware.js';
import { requireAnyRole, requireAuth } from '../auth/auth.middleware.js';
import { moderationSchema } from '../auth/auth.schemas.js';
import { moderateResourceController } from './resource.controller.js';
import {
  cancelDeletionRequestController, clearQuarantineController, decideDeletionRequestController, governanceInboxController, markGovernanceInboxViewedController,
  listDeletionRequestsController, listQuarantinedController, listResourceReportsController, listTrashController, purgeResourceController,
  quarantineResourceController, requestDeletionController, resourceHistoryController,
  restoreResourceController, resolveResourceReportController, submitResourceReportController,
} from './governance.controller.js';

export const resourceRouter = Router();

resourceRouter.get('/', listResourcesController);
resourceRouter.get('/governance/deletion-requests', requireAuth, listDeletionRequestsController);
resourceRouter.get('/governance/inbox', requireAuth, governanceInboxController);
resourceRouter.post('/governance/inbox/seen', requireAuth, markGovernanceInboxViewedController);
resourceRouter.post('/governance/deletion-requests/:requestId/decision', requireAuth, validateRequest({ params: requestIdParamsSchema }), decideDeletionRequestController);
resourceRouter.post('/governance/deletion-requests/:requestId/cancel', requireAuth, validateRequest({ params: requestIdParamsSchema }), cancelDeletionRequestController);
resourceRouter.get('/governance/trash', requireAuth, listTrashController);
resourceRouter.get('/governance/quarantined', requireAuth, listQuarantinedController);
resourceRouter.get('/governance/reports', requireAuth, listResourceReportsController);
resourceRouter.post('/governance/reports/:requestId/decision', requireAuth, validateRequest({ params: requestIdParamsSchema }), resolveResourceReportController);

resourceRouter.post('/', requireAuth, requireAnyRole('STUDENT', 'CONTRIBUTOR', 'SUPER_ADMIN'), resourceUpload, createResourceController);
resourceRouter.post('/:resourceId/moderation', requireAuth, requireAnyRole('SUPER_ADMIN', 'MODERATOR'), validateRequest({ params: resourceIdParamsSchema, body: moderationSchema }), moderateResourceController);
resourceRouter.post('/:resourceId/file', requireAuth, validateRequest({ params: resourceIdParamsSchema }), resourceUpload, replaceResourceFileController);
resourceRouter.post('/:resourceId/deletion-requests', requireAuth, validateRequest({ params: resourceIdParamsSchema }), requestDeletionController);
resourceRouter.post('/:resourceId/reports', requireAuth, validateRequest({ params: resourceIdParamsSchema }), submitResourceReportController);
resourceRouter.post('/:resourceId/restore', requireAuth, validateRequest({ params: resourceIdParamsSchema }), restoreResourceController);
resourceRouter.post('/:resourceId/quarantine', requireAuth, validateRequest({ params: resourceIdParamsSchema }), quarantineResourceController);
resourceRouter.post('/:resourceId/quarantine/clear', requireAuth, validateRequest({ params: resourceIdParamsSchema }), clearQuarantineController);
resourceRouter.post('/:resourceId/purge', requireAuth, validateRequest({ params: resourceIdParamsSchema }), purgeResourceController);
resourceRouter.get('/:resourceId/history', requireAuth, validateRequest({ params: resourceIdParamsSchema }), resourceHistoryController);
resourceRouter.get('/:resourceId/file', validateRequest({ params: resourceIdParamsSchema }), resourceFileController('inline'));
resourceRouter.get('/:resourceId/file/download', validateRequest({ params: resourceIdParamsSchema }), resourceFileController('attachment'));
resourceRouter.get('/:resourceId', validateRequest({ params: resourceIdParamsSchema }), getResourceController);
resourceRouter.patch('/:resourceId', requireAuth, validateRequest({ params: resourceIdParamsSchema }), updateResourceController);
resourceRouter.delete('/:resourceId', requireAuth, validateRequest({ params: resourceIdParamsSchema }), deleteResourceController);
