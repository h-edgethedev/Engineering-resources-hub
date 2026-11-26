import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ApiError } from '../../errors/ApiError.js';
import type { AuthContext } from '../auth/auth.types.js';
import {
  cancelDeletionRequest, clearQuarantine, decideDeletionRequest, listDeletionRequests, listQuarantined, listTrash,
  getGovernanceInbox, listResourceReports, markGovernanceInboxViewed, moveResourceToTrash, quarantineResource, requestPurge, requestResourceDeletion, resourceHistory, restoreResource, resolveResourceReport, submitResourceReport,
} from './governance.service.js';
import { deletionDecisionSchema, deletionRequestSchema, purgeSchema, quarantineSchema, reportDecisionSchema, requestIdParamsSchema, resourceIdParamsSchema, resourceReportSchema, trashReasonSchema } from './resource.schemas.js';

function id(request: Parameters<RequestHandler>[0], key: 'resourceId' | 'requestId') {
  const value = request.params[key];
  if (typeof value !== 'string') throw new ApiError(400, 'INVALID_ROUTE_PARAMETER', 'A required route parameter is invalid.');
  return value;
}
function actor(request: Parameters<RequestHandler>[0]): AuthContext {
  if (!request.auth) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to perform this action.');
  return request.auth;
}
function parsePage(request: Parameters<RequestHandler>[0]) {
  const parsed = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(), q: z.string().trim().max(200).optional() }).safeParse(request.query);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Request query is invalid.', parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
  return parsed.data;
}
function body<T>(schema: z.ZodType<T>, request: Parameters<RequestHandler>[0]): T {
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Request data is invalid.', parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
  return parsed.data;
}

export const moveToTrashController: RequestHandler = async (request, response, next) => {
  try { response.json({ data: await moveResourceToTrash(id(request, 'resourceId'), body(trashReasonSchema, request).reason, actor(request)) }); }
  catch (error) { next(error); }
};
export const requestDeletionController: RequestHandler = async (request, response, next) => {
  try { const value = body(deletionRequestSchema, request); response.status(201).json({ data: await requestResourceDeletion(id(request, 'resourceId'), value.category, value.explanation, actor(request)) }); }
  catch (error) { next(error); }
};
export const listDeletionRequestsController: RequestHandler = async (request, response, next) => {
  try { const query = parsePage(request); const result = await listDeletionRequests(actor(request), query.page, query.pageSize, query.status, query.q); response.json({ data: result.items, meta: result.meta }); }
  catch (error) { next(error); }
};
export const decideDeletionRequestController: RequestHandler = async (request, response, next) => {
  try { const value = body(deletionDecisionSchema, request); response.json({ data: await decideDeletionRequest(id(request, 'requestId'), value.action, value.note, actor(request)) }); }
  catch (error) { next(error); }
};
export const cancelDeletionRequestController: RequestHandler = async (request, response, next) => {
  try { response.json({ data: await cancelDeletionRequest(id(request, 'requestId'), actor(request)) }); }
  catch (error) { next(error); }
};
export const listTrashController: RequestHandler = async (request, response, next) => {
  try { const query = parsePage(request); const result = await listTrash(actor(request), query.page, query.pageSize, query.q); response.json({ data: result.items, meta: result.meta }); }
  catch (error) { next(error); }
};
export const listQuarantinedController: RequestHandler = async (request, response, next) => {
  try { const query = parsePage(request); const result = await listQuarantined(actor(request), query.page, query.pageSize, query.q); response.json({ data: result.items, meta: result.meta }); }
  catch (error) { next(error); }
};
export const governanceInboxController: RequestHandler = async (request, response, next) => {
  try { response.json({ data: await getGovernanceInbox(actor(request)) }); }
  catch (error) { next(error); }
};
export const markGovernanceInboxViewedController: RequestHandler = async (request, response, next) => {
  try { response.json({ data: await markGovernanceInboxViewed(actor(request)) }); }
  catch (error) { next(error); }
};
export const submitResourceReportController: RequestHandler = async (request, response, next) => {
  try { const value = body(resourceReportSchema, request); response.status(201).json({ data: await submitResourceReport(id(request, 'resourceId'), value.category, value.explanation, actor(request)) }); }
  catch (error) { next(error); }
};
export const listResourceReportsController: RequestHandler = async (request, response, next) => {
  try {
    const parsed = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']).optional(), q: z.string().trim().max(200).optional() }).safeParse(request.query);
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Request query is invalid.', parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
    const result = await listResourceReports(actor(request), parsed.data.page, parsed.data.pageSize, parsed.data.status, parsed.data.q);
    response.json({ data: result.items, meta: result.meta });
  } catch (error) { next(error); }
};
export const resolveResourceReportController: RequestHandler = async (request, response, next) => {
  try { const value = body(reportDecisionSchema, request); response.json({ data: await resolveResourceReport(id(request, 'requestId'), value.action, value.note, actor(request)) }); }
  catch (error) { next(error); }
};
export const restoreResourceController: RequestHandler = async (request, response, next) => {
  try { response.json({ data: await restoreResource(id(request, 'resourceId'), actor(request)) }); }
  catch (error) { next(error); }
};
export const quarantineResourceController: RequestHandler = async (request, response, next) => {
  try { const value = body(quarantineSchema, request); response.json({ data: await quarantineResource(id(request, 'resourceId'), value.reason, actor(request)) }); }
  catch (error) { next(error); }
};
export const clearQuarantineController: RequestHandler = async (request, response, next) => {
  try { const value = body(trashReasonSchema, request); response.json({ data: await clearQuarantine(id(request, 'resourceId'), value.reason, actor(request)) }); }
  catch (error) { next(error); }
};
export const resourceHistoryController: RequestHandler = async (request, response, next) => {
  try { response.json({ data: await resourceHistory(id(request, 'resourceId'), actor(request)) }); }
  catch (error) { next(error); }
};
export const purgeResourceController: RequestHandler = async (request, response, next) => {
  try { const value = body(purgeSchema, request); response.json({ data: await requestPurge(id(request, 'resourceId'), value.reason, actor(request)) }); }
  catch (error) { next(error); }
};
