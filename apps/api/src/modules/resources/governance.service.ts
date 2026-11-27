import { randomUUID } from 'node:crypto';
import { ApiError } from '../../errors/ApiError.js';
import { prisma } from '../../infrastructure/database.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { hasRole, hasRoleInUniversity } from '../auth/auth.middleware.js';
import type { AuthContext } from '../auth/auth.types.js';
import { getResourceStorage, resourceStorage } from './storage.js';
import type { UpdateResourceInput } from './resource.schemas.js';
import type { Express } from 'express';
import { basename } from 'node:path';
import { rm } from 'node:fs/promises';
import { validateFileSignature } from './resource.service.js';

const resourceInclude = {
  course: {
    select: {
      id: true, code: true, title: true,
      programme: { select: { department: { select: { faculty: { select: { university: { select: { slug: true } } } } } } } },
    },
  },
  academicSession: { select: { id: true, label: true } },
  semester: { select: { id: true, code: true, label: true, programmeLevel: { select: { id: true, code: true, label: true, programmeId: true } } } },
  file: { select: { id: true, provider: true, originalFilename: true, mediaType: true, byteSize: true } },
  uploader: { select: { id: true, displayName: true, profile: { select: { username: true } } } },
} as const;
const retentionMs = 30 * 24 * 60 * 60 * 1000;

type ResourceAccess = {
  id: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REMOVED'; uploadedById: string | null;
  trashedAt?: Date | null; quarantinedAt?: Date | null;
  course: { programme: { department: { faculty: { universityId: string } } } };
};

async function resourceAccess(resourceId: string) {
  return prisma.resource.findUnique({
    where: { id: resourceId }, select: {
      id: true, status: true, uploadedById: true, trashedAt: true, quarantinedAt: true,
      course: { select: { programme: { select: { department: { select: { faculty: { select: { universityId: true } } } } } } } },
    }
  });
}
function requireResource(resource: ResourceAccess | null): ResourceAccess {
  if (!resource) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
  return resource;
}
function isSuperAdmin(actor: AuthContext) { return hasRole(actor, 'SUPER_ADMIN'); }
function roleSnapshot(actor: AuthContext) {
  if (hasRole(actor, 'SUPER_ADMIN')) return 'SUPER_ADMIN';
  if (hasRole(actor, 'MODERATOR')) return 'MODERATOR';
  if (hasRole(actor, 'UNIVERSITY_ADMIN')) return 'UNIVERSITY_ADMIN';
  if (hasRole(actor, 'CONTRIBUTOR')) return 'CONTRIBUTOR';
  return 'STUDENT';
}
function canGovern(resource: ResourceAccess, actor: AuthContext) {
  return isSuperAdmin(actor) || hasRoleInUniversity(actor, resource.course.programme.department.faculty.universityId, 'MODERATOR');
}
function assertCanGovern(resource: ResourceAccess, actor: AuthContext) {
  if (!canGovern(resource, actor)) throw new ApiError(403, 'FORBIDDEN', 'You cannot manage this resource in its university.');
}
async function addEvent(tx: Prisma.TransactionClient, args: { resourceId: string; actor: AuthContext; action: string; reason?: string; fieldName?: string; previousValue?: unknown; newValue?: unknown }) {
  await tx.resourceGovernanceEvent.create({
    data: {
      resourceId: args.resourceId, resourceIdSnapshot: args.resourceId, actorId: args.actor.user.id,
      actorRole: roleSnapshot(args.actor), action: args.action, reason: args.reason, fieldName: args.fieldName,
      ...(args.previousValue === undefined ? {} : { previousValue: args.previousValue as Prisma.InputJsonValue }),
      ...(args.newValue === undefined ? {} : { newValue: args.newValue as Prisma.InputJsonValue }),
    }
  });
}

export async function editResourceMetadata(resourceId: string, input: UpdateResourceInput, actor: AuthContext) {
  const current = await prisma.resource.findUnique({ where: { id: resourceId }, include: resourceInclude });
  if (!current || current.trashedAt || current.status === 'REMOVED') throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
  const scope = requireResource(await resourceAccess(resourceId));
  const moderator = canGovern(scope, actor);
  if (!moderator && current.uploadedById !== actor.user.id) throw new ApiError(403, 'RESOURCE_OWNERSHIP_REQUIRED', 'Only the uploader or an authorized moderator can edit this resource.');
  if (current.quarantinedAt && !isSuperAdmin(actor)) throw new ApiError(409, 'RESOURCE_QUARANTINED', 'A quarantined resource cannot be edited until its safety review is complete.');
  const nextCourseId = input.courseId ?? current.courseId;
  const nextSessionId = input.academicSessionId === undefined ? current.academicSessionId : input.academicSessionId;
  const nextSemesterId = input.semesterId === undefined ? current.semesterId : input.semesterId;
  const course = await prisma.course.findFirst({ where: { id: nextCourseId, status: 'ACTIVE' }, select: { id: true, programme: { select: { department: { select: { faculty: { select: { universityId: true } } } } } } } });
  if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'Course was not found.');
  if (hasRole(actor, 'MODERATOR') && !isSuperAdmin(actor) && !hasRoleInUniversity(actor, course.programme.department.faculty.universityId, 'MODERATOR')) throw new ApiError(403, 'FORBIDDEN', 'You can only assign this resource to a course in a university you moderate.');
  if (nextSessionId || nextSemesterId) {
    const offering = await prisma.courseOffering.findFirst({ where: { courseId: nextCourseId, ...(nextSessionId ? { academicSessionId: nextSessionId } : {}), ...(nextSemesterId ? { semesterId: nextSemesterId } : {}) }, select: { courseId: true } });
    if (!offering) throw new ApiError(422, 'INVALID_RESOURCE_ACADEMIC_CONTEXT', 'The selected session or semester is not an offering for this course.');
  }
  const changes = Object.entries(input).filter(([key, value]) => JSON.stringify((current as Record<string, unknown>)[key]) !== JSON.stringify(value));
  const updated = await prisma.$transaction(async (tx) => {
    const data = { ...input, ...(!moderator && ['APPROVED', 'REJECTED'].includes(current.status) ? { status: 'PENDING' as const } : {}) };
    const result = await tx.resource.update({ where: { id: resourceId }, data, include: resourceInclude });
    for (const [fieldName, newValue] of changes) {
      await addEvent(tx, { resourceId, actor, action: 'METADATA_EDITED', fieldName, previousValue: (current as Record<string, unknown>)[fieldName], newValue });
    }
    if (!moderator && ['APPROVED', 'REJECTED'].includes(current.status)) {
      await tx.moderationAction.create({ data: { resourceId, resourceIdSnapshot: resourceId, actorId: actor.user.id, action: 'RESUBMITTED' } });
      await addEvent(tx, { resourceId, actor, action: 'RESUBMITTED', reason: 'Uploader changed resource metadata.' });
    }
    return result;
  });
  return updated;
}

export async function replaceResourceFile(resourceId: string, file: Express.Multer.File, actor: AuthContext) {
  if (!isSuperAdmin(actor)) throw new ApiError(403, 'FORBIDDEN', 'Only a Super Admin can replace a resource file.');
  const resource = await prisma.resource.findUnique({ where: { id: resourceId }, include: { file: true } });
  if (!resource || resource.trashedAt || resource.status === 'REMOVED') throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
  if (resource.quarantinedAt) throw new ApiError(409, 'RESOURCE_QUARANTINED', 'Clear the safety quarantine before replacing the file.');
  await validateFileSignature(file);
  const originalFilename = basename(file.originalname).replace(/[\r\n\0]/g, '').slice(0, 255);
  if (!originalFilename) throw new ApiError(400, 'INVALID_RESOURCE_FILENAME', 'The uploaded filename is invalid.');
  const stored = await resourceStorage.put(file.path, originalFilename);
  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.resourceFile.upsert({
        where: { resourceId },
        create: { resourceId, provider: resourceStorage.provider, storageKey: stored.storageKey, originalFilename, mediaType: file.mimetype, byteSize: file.size },
        update: { provider: resourceStorage.provider, storageKey: stored.storageKey, originalFilename, mediaType: file.mimetype, byteSize: file.size },
      });
      const result = await tx.resource.update({ where: { id: resourceId }, data: { status: 'PENDING' }, include: resourceInclude });
      await addEvent(tx, { resourceId, actor, action: 'FILE_REPLACED', reason: 'Super Admin replaced the resource file and returned the resource to review.', previousValue: resource.file ? { provider: resource.file.provider, originalFilename: resource.file.originalFilename, mediaType: resource.file.mediaType, byteSize: resource.file.byteSize } : null, newValue: { provider: resourceStorage.provider, originalFilename, mediaType: file.mimetype, byteSize: file.size } });
      await tx.moderationAction.create({ data: { resourceId, resourceIdSnapshot: resourceId, actorId: actor.user.id, action: 'RESUBMITTED', reason: 'File replaced by Super Admin.' } });
      return result;
    });
    if (resource.file) {
      try { await getResourceStorage(resource.file.provider).delete(resource.file.storageKey); }
      catch (error) { console.error('Unable to delete the replaced resource file; orphan cleanup is required.', error); }
    }
    return updated;
  } catch (error) {
    await resourceStorage.delete(stored.storageKey).catch(() => undefined);
    throw error;
  } finally {
    await rm(file.path, { force: true });
  }
}

export async function requestResourceDeletion(resourceId: string, category: string, explanation: string, actor: AuthContext) {
  const resource = requireResource(await resourceAccess(resourceId));
  if (resource.status === 'REMOVED') throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
  const owner = resource.uploadedById === actor.user.id;
  if (!owner) assertCanGovern(resource, actor);
  if (hasRole(actor, 'MODERATOR') && resource.uploadedById === actor.user.id && !isSuperAdmin(actor)) {
    throw new ApiError(403, 'SELF_GOVERNANCE_FORBIDDEN', 'A moderator cannot request governance action on their own resource.');
  }
  if (await prisma.deletionRequest.findFirst({ where: { resourceId, status: 'PENDING' }, select: { id: true } })) throw new ApiError(409, 'DELETION_REQUEST_EXISTS', 'A pending deletion request already exists for this resource.');
  try {
    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.deletionRequest.create({ data: { resourceId, resourceIdSnapshot: resourceId, universityIdSnapshot: resource.course.programme.department.faculty.universityId, requestedById: actor.user.id, requestedByRole: roleSnapshot(actor), category: category as never, explanation } });
      await addEvent(tx, { resourceId, actor, action: 'DELETION_REQUESTED', reason: explanation });
      return created;
    });
    return request;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new ApiError(409, 'DELETION_REQUEST_EXISTS', 'A pending deletion request already exists for this resource.');
    throw error;
  }
}

export async function listDeletionRequests(actor: AuthContext, page: number, pageSize: number, status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED', q?: string) {
  const universityIds = actor.user.roleAssignments.filter((grant) => grant.role === 'MODERATOR' && grant.universityId).map((grant) => grant.universityId as string);
  if (!isSuperAdmin(actor) && universityIds.length === 0) throw new ApiError(403, 'FORBIDDEN', 'Only Moderators and Super Administrators can review deletion requests.');
  const search = q ? {
    OR: [
      { resource: { title: { contains: q, mode: 'insensitive' as const } } },
      { resource: { course: { code: { contains: q, mode: 'insensitive' as const } } } },
      { explanation: { contains: q, mode: 'insensitive' as const } },
    ],
  } : {};
  const where = { ...(status ? { status } : {}), ...search, ...(isSuperAdmin(actor) ? {} : { universityIdSnapshot: { in: universityIds } }) };
  const [total, items] = await Promise.all([
    prisma.deletionRequest.count({ where }),
    prisma.deletionRequest.findMany({ where, include: { resource: { include: resourceInclude } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function decideDeletionRequest(requestId: string, action: 'APPROVE' | 'REJECT', note: string | undefined, actor: AuthContext) {
  if (!isSuperAdmin(actor)) throw new ApiError(403, 'FORBIDDEN', 'Only a Super Administrator can decide deletion requests.');
  const request = await prisma.deletionRequest.findUnique({ where: { id: requestId }, include: { resource: { include: { file: true } } } });
  if (!request || request.status !== 'PENDING') throw new ApiError(409, 'DELETION_REQUEST_NOT_PENDING', 'This deletion request is no longer pending.');
  if (!request.resource || request.resource.trashedAt || request.resource.status === 'REMOVED') throw new ApiError(409, 'RESOURCE_NOT_ELIGIBLE', 'The requested resource is no longer available for this decision.');
  const resource = request.resource;
  const decidedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const changed = await tx.deletionRequest.updateMany({ where: { id: requestId, status: 'PENDING' }, data: { status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED', decidedById: actor.user.id, decidedByRole: roleSnapshot(actor), decidedAt, decisionNote: note } });
    if (changed.count !== 1) throw new ApiError(409, 'DELETION_REQUEST_NOT_PENDING', 'This deletion request has already been decided.');
    if (action === 'APPROVE') {
      await tx.resource.update({ where: { id: request.resourceId as string, trashedAt: null }, data: { trashedAt: decidedAt, trashExpiresAt: new Date(decidedAt.getTime() + retentionMs), trashGeneration: randomUUID(), trashedById: actor.user.id, trashReason: request.explanation, trashMethod: 'APPROVED_REQUEST', statusBeforeTrash: resource.status } });
    }
    await addEvent(tx, { resourceId: request.resourceId as string, actor, action: action === 'APPROVE' ? 'DELETION_REQUEST_APPROVED' : 'DELETION_REQUEST_REJECTED', reason: note });
  });
  return prisma.deletionRequest.findUniqueOrThrow({ where: { id: requestId }, include: { resource: { include: resourceInclude } } });
}

export async function cancelDeletionRequest(requestId: string, actor: AuthContext) {
  const request = await prisma.deletionRequest.findUnique({ where: { id: requestId } });
  if (!request || request.requestedById !== actor.user.id || request.status !== 'PENDING') throw new ApiError(404, 'DELETION_REQUEST_NOT_FOUND', 'A pending deletion request owned by you was not found.');
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const changed = await tx.deletionRequest.updateMany({ where: { id: requestId, requestedById: actor.user.id, status: 'PENDING' }, data: { status: 'CANCELLED', decidedAt: now, decidedById: actor.user.id, decidedByRole: roleSnapshot(actor) } });
    if (!changed.count) throw new ApiError(409, 'DELETION_REQUEST_NOT_PENDING', 'This deletion request has already been decided.');
    await addEvent(tx, { resourceId: request.resourceIdSnapshot, actor, action: 'DELETION_REQUEST_CANCELLED' });
  });
  return prisma.deletionRequest.findUniqueOrThrow({ where: { id: requestId } });
}

export async function moveResourceToTrash(resourceId: string, reason: string, actor: AuthContext) {
  if (!isSuperAdmin(actor)) throw new ApiError(403, 'FORBIDDEN', 'Only a Super Administrator can directly move a resource to Trash.');
  const resource = await prisma.resource.findUnique({ where: { id: resourceId }, include: { file: true } });
  if (!resource || resource.status === 'REMOVED') throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
  if (resource.trashedAt) throw new ApiError(409, 'RESOURCE_ALREADY_TRASHED', 'This resource is already in Trash.');
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const result = await tx.resource.update({ where: { id: resourceId, trashedAt: null }, data: { trashedAt: now, trashExpiresAt: new Date(now.getTime() + retentionMs), trashGeneration: randomUUID(), trashedById: actor.user.id, trashReason: reason, trashMethod: 'SUPER_ADMIN_DIRECT', statusBeforeTrash: resource.status, quarantinedAt: null, quarantinedById: null, quarantineReason: null }, include: resourceInclude });
    await tx.deletionRequest.updateMany({ where: { resourceId, status: 'PENDING' }, data: { status: 'CANCELLED', decidedById: actor.user.id, decidedByRole: 'SUPER_ADMIN', decidedAt: now, decisionNote: 'Resource was moved directly to Trash by a Super Admin.' } });
    if (resource.quarantinedAt) await addEvent(tx, { resourceId, actor, action: 'QUARANTINE_CLEARED_FOR_TRASH', reason });
    await addEvent(tx, { resourceId, actor, action: 'MOVED_TO_TRASH', reason });
    return result;
  });
}

export async function listTrash(actor: AuthContext, page: number, pageSize: number, q?: string) {
  const universityIds = actor.user.roleAssignments.filter((grant) => grant.role === 'MODERATOR' && grant.universityId).map((grant) => grant.universityId as string);
  if (!isSuperAdmin(actor) && universityIds.length === 0) throw new ApiError(403, 'FORBIDDEN', 'Only Moderators and Super Administrators can view Trash.');
  const where = { trashedAt: { not: null }, ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' as const } }, { course: { code: { contains: q, mode: 'insensitive' as const } } }] } : {}), ...(isSuperAdmin(actor) ? {} : { course: { programme: { department: { faculty: { universityId: { in: universityIds } } } } } }) };
  const [total, items] = await Promise.all([prisma.resource.count({ where }), prisma.resource.findMany({ where, include: resourceInclude, orderBy: [{ trashedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize })]);
  return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function listQuarantined(actor: AuthContext, page: number, pageSize: number, q?: string) {
  const universityIds = actor.user.roleAssignments.filter((grant) => grant.role === 'MODERATOR' && grant.universityId).map((grant) => grant.universityId as string);
  if (!isSuperAdmin(actor) && universityIds.length === 0) throw new ApiError(403, 'FORBIDDEN', 'Only Moderators and Super Administrators can view quarantined resources.');
  const search = q ? { OR: [{ title: { contains: q, mode: 'insensitive' as const } }, { course: { code: { contains: q, mode: 'insensitive' as const } } }, { course: { title: { contains: q, mode: 'insensitive' as const } } }] } : {};
  const where = { quarantinedAt: { not: null }, trashedAt: null, ...search, ...(isSuperAdmin(actor) ? {} : { course: { programme: { department: { faculty: { universityId: { in: universityIds } } } } } }) };
  const [total, items] = await Promise.all([prisma.resource.count({ where }), prisma.resource.findMany({ where, include: resourceInclude, orderBy: [{ quarantinedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize })]);
  return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function getGovernanceInbox(actor: AuthContext) {
  const isAdmin = isSuperAdmin(actor);
  const universityIds = actor.user.roleAssignments.filter((grant) => grant.role === 'MODERATOR' && grant.universityId).map((grant) => grant.universityId as string);
  if (!isAdmin && universityIds.length === 0) throw new ApiError(403, 'FORBIDDEN', 'Only Moderators and Super Administrators can view governance notifications.');
  const state = await prisma.governanceInboxState.findUnique({ where: { userId: actor.user.id }, select: { lastViewedAt: true } });
  const lastViewedAt = state?.lastViewedAt ?? new Date(0);
  const resourceScope = isAdmin ? {} : { course: { programme: { department: { faculty: { universityId: { in: universityIds } } } } } };
  const reviewWhere = {
    status: 'PENDING' as const, trashedAt: null, quarantinedAt: null,
    ...(!isAdmin ? { uploadedById: { not: actor.user.id } } : {}), ...resourceScope,
  };
  const requestScope = isAdmin ? {} : { universityIdSnapshot: { in: universityIds } };
  const reportScope = isAdmin ? {} : { universityIdSnapshot: { in: universityIds } };
  const [pendingResources, deletionRequests, reports, unreadResources, unreadRequests, unreadReports, totalResources, totalRequests, totalReports] = await Promise.all([
    prisma.resource.findMany({ where: reviewWhere, include: resourceInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 8 }),
    prisma.deletionRequest.findMany({ where: { status: 'PENDING', ...requestScope }, include: { resource: { include: resourceInclude } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 8 }),
    prisma.resourceReport.findMany({ where: { status: 'OPEN', ...reportScope }, include: { resource: { include: resourceInclude } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 8 }),
    prisma.resource.count({ where: { ...reviewWhere, createdAt: { gt: lastViewedAt } } }),
    prisma.deletionRequest.count({ where: { status: 'PENDING', ...requestScope, createdAt: { gt: lastViewedAt } } }),
    prisma.resourceReport.count({ where: { status: 'OPEN', ...reportScope, createdAt: { gt: lastViewedAt } } }),
    prisma.resource.count({ where: reviewWhere }),
    prisma.deletionRequest.count({ where: { status: 'PENDING', ...requestScope } }),
    prisma.resourceReport.count({ where: { status: 'OPEN', ...reportScope } }),
  ]);
  const reviewLink = isAdmin ? '/app/admin/resources' : '/app/moderation/queue';
  const items = [
    ...pendingResources.map((resource) => ({ id: resource.id, kind: 'RESOURCE_REVIEW', title: resource.title, detail: `${resource.course.code} · ${resource.course.title}`, createdAt: resource.createdAt, href: reviewLink })),
    ...deletionRequests.map((request) => ({ id: request.id, kind: 'DELETION_REQUEST', title: request.resource?.title ?? 'Deletion request', detail: request.explanation, createdAt: request.createdAt, href: '/app/governance/resources?tab=requests' })),
    ...reports.map((report) => ({ id: report.id, kind: 'RESOURCE_REPORT', title: report.resource?.title ?? 'Reported resource', detail: report.explanation, createdAt: report.createdAt, href: '/app/governance/resources?tab=reports' })),
  ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()).slice(0, 12);
  const counts = { resources: totalResources, deletionRequests: totalRequests, reports: totalReports };
  const unreadCounts = { resources: unreadResources, deletionRequests: unreadRequests, reports: unreadReports };
  return { unreadCount: unreadResources + unreadRequests + unreadReports, unreadCounts, counts, items, lastViewedAt: state?.lastViewedAt ?? null };
}

export async function markGovernanceInboxViewed(actor: AuthContext) {
  if (!isSuperAdmin(actor) && !actor.user.roleAssignments.some((grant) => grant.role === 'MODERATOR' && grant.universityId)) throw new ApiError(403, 'FORBIDDEN', 'Only Moderators and Super Administrators can view governance notifications.');
  const state = await prisma.governanceInboxState.upsert({ where: { userId: actor.user.id }, create: { userId: actor.user.id, lastViewedAt: new Date() }, update: { lastViewedAt: new Date() }, select: { lastViewedAt: true } });
  return state;
}

export async function submitResourceReport(resourceId: string, category: string, explanation: string, actor: AuthContext) {
  const resource = requireResource(await resourceAccess(resourceId));
  if (resource.status !== 'APPROVED' || resource.trashedAt || resource.quarantinedAt) throw new ApiError(404, 'RESOURCE_NOT_REPORTABLE', 'Only currently published resources can be reported.');
  if (resource.uploadedById === actor.user.id) throw new ApiError(409, 'SELF_REPORT_FORBIDDEN', 'You cannot report your own resource.');
  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.resourceReport.create({ data: { resourceId, resourceIdSnapshot: resourceId, universityIdSnapshot: resource.course.programme.department.faculty.universityId, reporterId: actor.user.id, reporterRole: roleSnapshot(actor), category: category as never, explanation } });
      await addEvent(tx, { resourceId, actor, action: 'RESOURCE_REPORTED', reason: explanation });
      return created;
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new ApiError(409, 'REPORT_ALREADY_OPEN', 'You already have an open report for this resource.');
    throw error;
  }
}

export async function listResourceReports(actor: AuthContext, page: number, pageSize: number, status?: 'OPEN' | 'RESOLVED' | 'DISMISSED', q?: string) {
  const universityIds = actor.user.roleAssignments.filter((grant) => grant.role === 'MODERATOR' && grant.universityId).map((grant) => grant.universityId as string);
  if (!isSuperAdmin(actor) && universityIds.length === 0) throw new ApiError(403, 'FORBIDDEN', 'Only Moderators and Super Administrators can review reports.');
  const search = q ? { OR: [{ resource: { title: { contains: q, mode: 'insensitive' as const } } }, { resource: { course: { code: { contains: q, mode: 'insensitive' as const } } } }, { explanation: { contains: q, mode: 'insensitive' as const } }] } : {};
  const where = { ...(status ? { status } : {}), ...search, ...(isSuperAdmin(actor) ? {} : { universityIdSnapshot: { in: universityIds } }) };
  const [total, items] = await Promise.all([
    prisma.resourceReport.count({ where }),
    prisma.resourceReport.findMany({ where, include: { resource: { include: resourceInclude } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function resolveResourceReport(reportId: string, action: 'RESOLVED' | 'DISMISSED', note: string, actor: AuthContext) {
  const report = await prisma.resourceReport.findUnique({ where: { id: reportId } });
  if (!report || report.status !== 'OPEN') throw new ApiError(409, 'REPORT_NOT_OPEN', 'This report is no longer open.');
  if (!isSuperAdmin(actor) && !hasRoleInUniversity(actor, report.universityIdSnapshot, 'MODERATOR')) throw new ApiError(403, 'FORBIDDEN', 'You cannot review reports for this university.');
  if (report.reporterId === actor.user.id) throw new ApiError(403, 'SELF_REVIEW_FORBIDDEN', 'You cannot review a report you submitted.');
  const reviewedAt = new Date();
  const changed = await prisma.resourceReport.updateMany({ where: { id: reportId, status: 'OPEN' }, data: { status: action, reviewedById: actor.user.id, reviewedByRole: roleSnapshot(actor), reviewedAt, resolutionNote: note } });
  if (!changed.count) throw new ApiError(409, 'REPORT_NOT_OPEN', 'This report has already been reviewed.');
  await prisma.resourceGovernanceEvent.create({ data: { resourceId: report.resourceId, resourceIdSnapshot: report.resourceIdSnapshot, actorId: actor.user.id, actorRole: roleSnapshot(actor), action: `REPORT_${action}`, reason: note } });
  return prisma.resourceReport.findUniqueOrThrow({ where: { id: reportId }, include: { resource: { include: resourceInclude } } });
}

export async function restoreResource(resourceId: string, actor: AuthContext) {
  const resource = await prisma.resource.findUnique({ where: { id: resourceId }, include: { ...resourceInclude, file: true } });
  if (!resource || !resource.trashedAt) throw new ApiError(404, 'RESOURCE_NOT_IN_TRASH', 'This resource is not in Trash.');
  const scope = requireResource(await resourceAccess(resourceId));
  if (!canGovern(scope, actor)) throw new ApiError(403, 'FORBIDDEN', 'You cannot restore this resource in its university.');
  if (resource.quarantinedAt) throw new ApiError(409, 'RESOURCE_QUARANTINED', 'Clear the safety quarantine before restoring this resource.');
  const purgeJob = resource.trashGeneration ? await prisma.resourcePurgeJob.findUnique({ where: { trashGenerationSnapshot: resource.trashGeneration } }) : null;
  if (purgeJob && ['PROCESSING', 'COMPLETE'].includes(purgeJob.status)) throw new ApiError(409, 'PURGE_IN_PROGRESS', 'This resource has entered permanent deletion and cannot be restored.');
  if (resource.file) {
    try { const storedFile = await getResourceStorage(resource.file.provider).get(resource.file.storageKey); storedFile.destroy(); } catch { throw new ApiError(409, 'RESOURCE_FILE_UNAVAILABLE', 'The stored file is unavailable, so this resource cannot be restored.'); }
  }
  if (!resource.file) throw new ApiError(409, 'RESOURCE_FILE_UNAVAILABLE', 'The stored file is missing, so this resource cannot be restored.');
  const course = await prisma.course.findFirst({ where: { id: resource.courseId, status: 'ACTIVE' }, select: { id: true } });
  if (!course) throw new ApiError(409, 'ACADEMIC_CONTEXT_INVALID', 'The resource course is no longer active.');
  if (resource.academicSessionId || resource.semesterId) {
    const offering = await prisma.courseOffering.findFirst({ where: { courseId: resource.courseId, ...(resource.academicSessionId ? { academicSessionId: resource.academicSessionId } : {}), ...(resource.semesterId ? { semesterId: resource.semesterId } : {}) }, select: { courseId: true } });
    if (!offering) throw new ApiError(409, 'ACADEMIC_CONTEXT_INVALID', 'The resource academic offering is no longer valid.');
  }
  const duplicate = await prisma.resource.findFirst({ where: { id: { not: resourceId }, trashedAt: null, status: { not: 'REMOVED' }, courseId: resource.courseId, title: { equals: resource.title, mode: 'insensitive' }, type: resource.type }, select: { id: true } });
  if (duplicate) throw new ApiError(409, 'RESOURCE_DUPLICATE_CONFLICT', 'A resource with this title and type already exists for the course.');
  return prisma.$transaction(async (tx) => {
    if (purgeJob) {
      const cancelled = await tx.resourcePurgeJob.updateMany({ where: { id: purgeJob.id, status: { in: ['PENDING', 'RETRY'] } }, data: { status: 'CANCELLED' } });
      if (!cancelled.count) throw new ApiError(409, 'PURGE_IN_PROGRESS', 'This resource has entered permanent deletion and cannot be restored.');
    }
    const changed = await tx.resource.updateMany({ where: { id: resourceId, trashedAt: { not: null } }, data: { trashedAt: null, trashExpiresAt: null, trashGeneration: null, trashedById: null, trashReason: null, trashMethod: null, status: resource.statusBeforeTrash ?? 'PENDING', statusBeforeTrash: null } });
    if (!changed.count) throw new ApiError(409, 'RESOURCE_NOT_IN_TRASH', 'This resource has already been restored or purged.');
    await addEvent(tx, { resourceId, actor, action: 'RESTORED_FROM_TRASH' });
    return tx.resource.findUniqueOrThrow({ where: { id: resourceId }, include: resourceInclude });
  });
}

export async function quarantineResource(resourceId: string, reason: string, actor: AuthContext) {
  const resource = requireResource(await resourceAccess(resourceId));
  assertCanGovern(resource, actor);
  if (resource.uploadedById === actor.user.id && !isSuperAdmin(actor)) throw new ApiError(403, 'SELF_GOVERNANCE_FORBIDDEN', 'A moderator cannot quarantine their own resource.');
  const now = new Date();
  const changed = await prisma.resource.updateMany({ where: { id: resourceId, trashedAt: null, quarantinedAt: null, status: { not: 'REMOVED' } }, data: { quarantinedAt: now, quarantinedById: actor.user.id, quarantineReason: reason } });
  if (!changed.count) throw new ApiError(409, 'RESOURCE_NOT_QUARANTINABLE', 'This resource is already quarantined, in Trash, or unavailable.');
  await prisma.resourceGovernanceEvent.create({ data: { resourceId, resourceIdSnapshot: resourceId, actorId: actor.user.id, actorRole: roleSnapshot(actor), action: 'QUARANTINED', reason } });
  return prisma.resource.findUniqueOrThrow({ where: { id: resourceId }, include: resourceInclude });
}

export async function clearQuarantine(resourceId: string, reason: string, actor: AuthContext) {
  if (!isSuperAdmin(actor)) throw new ApiError(403, 'FORBIDDEN', 'Only a Super Administrator can clear a safety quarantine.');
  const changed = await prisma.resource.updateMany({ where: { id: resourceId, quarantinedAt: { not: null } }, data: { quarantinedAt: null, quarantinedById: null, quarantineReason: null } });
  if (!changed.count) throw new ApiError(404, 'RESOURCE_NOT_QUARANTINED', 'An active quarantined resource was not found.');
  await prisma.resourceGovernanceEvent.create({ data: { resourceId, resourceIdSnapshot: resourceId, actorId: actor.user.id, actorRole: roleSnapshot(actor), action: 'QUARANTINE_CLEARED', reason } });
  return prisma.resource.findUniqueOrThrow({ where: { id: resourceId }, include: resourceInclude });
}

export async function resourceHistory(resourceId: string, actor: AuthContext) {
  const resource = await resourceAccess(resourceId);
  if (!resource && !isSuperAdmin(actor)) throw new ApiError(403, 'FORBIDDEN', 'Only a Super Admin can view history after a resource has been permanently deleted.');
  if (resource && !canGovern(resource, actor) && resource.uploadedById !== actor.user.id) throw new ApiError(403, 'FORBIDDEN', 'You cannot view this resource history.');
  const [events, moderationActions, deletionRequests, reports] = await Promise.all([
    prisma.resourceGovernanceEvent.findMany({ where: { resourceIdSnapshot: resourceId }, orderBy: { createdAt: 'asc' } }),
    prisma.moderationAction.findMany({ where: { resourceIdSnapshot: resourceId }, orderBy: { createdAt: 'asc' } }),
    prisma.deletionRequest.findMany({ where: { resourceIdSnapshot: resourceId }, orderBy: { createdAt: 'asc' } }),
    prisma.resourceReport.findMany({ where: { resourceIdSnapshot: resourceId }, orderBy: { createdAt: 'asc' } }),
  ]);
  const actorIds = [...new Set([
    ...events.map((entry) => entry.actorId),
    ...moderationActions.map((entry) => entry.actorId),
    ...deletionRequests.flatMap((entry) => [entry.requestedById, entry.decidedById]),
    ...reports.flatMap((entry) => [entry.reporterId, entry.reviewedById]),
  ].filter((id): id is string => Boolean(id)))];
  const users = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true, profile: { select: { username: true } } } }) : [];
  const names = new Map(users.map((user) => [user.id, user.profile?.username ? `${user.displayName} (@${user.profile.username})` : user.displayName]));
  const actorName = (id: string | null) => id ? names.get(id) ?? 'Former or unavailable user' : 'System';
  return {
    events: events.map((entry) => ({ ...entry, actorName: actorName(entry.actorId) })),
    moderationActions: moderationActions.map((entry) => ({ ...entry, actorName: actorName(entry.actorId) })),
    deletionRequests: deletionRequests.map((entry) => ({ ...entry, requestedByName: actorName(entry.requestedById), decidedByName: actorName(entry.decidedById) })),
    reports: reports.map((entry) => ({ ...entry, reporterName: actorName(entry.reporterId), reviewedByName: actorName(entry.reviewedById) })),
  };
}

export async function requestPurge(resourceId: string, reason: string, actor: AuthContext) {
  if (!isSuperAdmin(actor)) throw new ApiError(403, 'FORBIDDEN', 'Only a Super Administrator can permanently delete a resource.');
  const resource = await prisma.resource.findUnique({ where: { id: resourceId }, include: { file: true } });
  if (!resource?.trashedAt) throw new ApiError(409, 'RESOURCE_NOT_IN_TRASH', 'Only resources in Trash can be permanently deleted.');
  if (!resource.trashGeneration) throw new ApiError(409, 'TRASH_METADATA_MISSING', 'This resource lacks current Trash metadata and cannot be permanently deleted through this workflow.');
  const job = await prisma.resourcePurgeJob.upsert({ where: { trashGenerationSnapshot: resource.trashGeneration }, create: { resourceIdSnapshot: resourceId, trashGenerationSnapshot: resource.trashGeneration, provider: resource.file?.provider ?? 'none', storageKey: resource.file?.storageKey ?? '' }, update: {} });
  await prisma.resourceGovernanceEvent.create({ data: { resourceId, resourceIdSnapshot: resourceId, actorId: actor.user.id, actorRole: 'SUPER_ADMIN', action: 'PERMANENT_PURGE_REQUESTED', reason } });
  await processPurgeJob(job.id);
  return prisma.resourcePurgeJob.findUniqueOrThrow({ where: { id: job.id } });
}

export async function processPurgeJob(jobId: string) {
  const job = await prisma.resourcePurgeJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === 'COMPLETE') return job;
  const staleBefore = new Date(Date.now() - 5 * 60_000);
  const claimed = await prisma.resourcePurgeJob.updateMany({ where: { id: jobId, OR: [{ status: { in: ['PENDING', 'RETRY'] } }, { status: 'PROCESSING', startedAt: { lt: staleBefore } }] }, data: { status: 'PROCESSING', startedAt: new Date(), attempts: { increment: 1 }, lastError: null } });
  if (!claimed.count) return prisma.resourcePurgeJob.findUnique({ where: { id: jobId } });
  const current = await prisma.resourcePurgeJob.findUniqueOrThrow({ where: { id: jobId } });
  try {
    if (current.provider !== 'none') await getResourceStorage(current.provider).delete(current.storageKey);
    await prisma.$transaction(async (tx) => {
      const deleted = await tx.resource.deleteMany({ where: { id: current.resourceIdSnapshot, trashedAt: { not: null }, trashGeneration: current.trashGenerationSnapshot } });
      if (deleted.count !== 1) throw new Error('Resource state changed before purge could complete.');
      await tx.resourceGovernanceEvent.create({ data: { resourceIdSnapshot: current.resourceIdSnapshot, actorRole: 'SYSTEM', action: 'PERMANENTLY_PURGED', reason: 'Resource retention period expired or Super Admin requested permanent deletion.' } });
      await tx.resourcePurgeJob.update({ where: { id: jobId }, data: { status: 'COMPLETE', completedAt: new Date(), lastError: null } });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : 'Unknown storage/database failure.';
    await prisma.resourcePurgeJob.update({ where: { id: jobId }, data: { status: 'RETRY', startedAt: null, lastError: message } });
  }
  return prisma.resourcePurgeJob.findUnique({ where: { id: jobId } });
}

export async function scheduleExpiredTrash() {
  const expired = await prisma.resource.findMany({ where: { trashedAt: { not: null }, trashExpiresAt: { lte: new Date() }, trashGeneration: { not: null } }, include: { file: true }, take: 100, orderBy: { trashExpiresAt: 'asc' } });
  for (const resource of expired) {
    const generation = resource.trashGeneration as string;
    await prisma.resourcePurgeJob.upsert({ where: { trashGenerationSnapshot: generation }, create: { resourceIdSnapshot: resource.id, trashGenerationSnapshot: generation, provider: resource.file?.provider ?? 'none', storageKey: resource.file?.storageKey ?? '' }, update: {} });
  }
  const retryable = await prisma.resourcePurgeJob.findMany({ where: { OR: [{ status: { in: ['PENDING', 'RETRY'] } }, { status: 'PROCESSING', startedAt: { lt: new Date(Date.now() - 5 * 60_000) } }] }, select: { id: true }, take: 100, orderBy: { createdAt: 'asc' } });
  for (const job of retryable) await processPurgeJob(job.id);
}
