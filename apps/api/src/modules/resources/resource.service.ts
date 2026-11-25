import { ApiError } from '../../errors/ApiError.js';
import { prisma } from '../../infrastructure/database.js';
import { getResourceStorage, resourceStorage } from './storage.js';
import type { Express } from 'express';
import { open } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { rm } from 'node:fs/promises';
import type { CreateResourceInput, ListResourcesQuery, UpdateResourceInput } from './resource.schemas.js';
import { hasRole, hasRoleInUniversity } from '../auth/auth.middleware.js';
import type { AuthContext } from '../auth/auth.types.js';

const resourceInclude = {
  course: {
    select: {
      id: true, code: true, title: true,
      programme: { select: { department: { select: { faculty: { select: { university: { select: { slug: true } } } } } } } },
    },
  },
  academicSession: { select: { id: true, label: true } },
  semester: { select: { id: true, code: true, label: true, programmeLevel: { select: { code: true, label: true } } } },
  file: { select: { id: true, provider: true, originalFilename: true, mediaType: true, byteSize: true } },
  uploader: { select: { id: true, displayName: true, profile: { select: { username: true } } } },
} as const;

const scopeSelect = {
  id: true,
  status: true,
  uploadedById: true,
  trashedAt: true,
  quarantinedAt: true,
  course: { select: { programme: { select: { department: { select: { faculty: { select: { universityId: true } } } } } } } },
  file: { select: { provider: true, storageKey: true } },
} as const;

type ResourceScopeRecord = {
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REMOVED';
  uploadedById: string | null;
  trashedAt?: Date | null;
  quarantinedAt?: Date | null;
  course: { programme: { department: { faculty: { universityId: string } } } };
};

function canViewResource(resource: ResourceScopeRecord, actor?: AuthContext) {
  if (resource.trashedAt || resource.status === 'REMOVED') return false;
  const universityId = resource.course.programme.department.faculty.universityId;
  if (resource.quarantinedAt && (!actor || (!hasRole(actor, 'SUPER_ADMIN') && !hasRoleInUniversity(actor, universityId, 'MODERATOR')))) return false;
  if (resource.status === 'APPROVED' && !resource.quarantinedAt) return true;
  if (!actor) return false;
  if (resource.uploadedById === actor.user.id) return true;
  return hasRole(actor, 'SUPER_ADMIN') || hasRoleInUniversity(actor, universityId, 'UNIVERSITY_ADMIN', 'MODERATOR');
}

async function findResourceScope(resourceId: string) {
  return prisma.resource.findUnique({ where: { id: resourceId }, select: scopeSelect });
}

type AcademicContext = { courseId: string; academicSessionId?: string | null; semesterId?: string | null };

async function validateAcademicContext(context: AcademicContext) {
  const course = await prisma.course.findFirst({ where: { id: context.courseId, status: 'ACTIVE' }, select: { id: true } });
  if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'Course was not found.');

  if (!context.academicSessionId && !context.semesterId) return;
  const offering = await prisma.courseOffering.findFirst({
    where: {
      courseId: context.courseId,
      ...(context.academicSessionId ? { academicSessionId: context.academicSessionId } : {}),
      ...(context.semesterId ? { semesterId: context.semesterId } : {}),
    },
    select: { courseId: true },
  });
  if (!offering) {
    throw new ApiError(422, 'INVALID_RESOURCE_ACADEMIC_CONTEXT', 'The selected session or semester is not an offering for this course.');
  }
}

export async function listResources(query: ListResourcesQuery, actor?: AuthContext) {
  const { page, pageSize, status, q, mine, reviewQueue, ...filters } = query;
  const isSuperAdmin = actor ? hasRole(actor, 'SUPER_ADMIN') : false;
  if (mine && !actor) {
    throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to view your submitted resources.');
  }
  if (reviewQueue && (!actor || !hasRole(actor, 'SUPER_ADMIN', 'MODERATOR'))) {
    throw new ApiError(403, 'FORBIDDEN', 'Only moderators and Super Administrators can view the review queue.');
  }
  const visibility: object[] = [{ status: 'APPROVED' }];
  if (actor) {
    if (!isSuperAdmin) {
      visibility.push({ uploadedById: actor.user.id });
      const universityIds = actor.user.roleAssignments
        .filter((grant) => ['UNIVERSITY_ADMIN', 'MODERATOR'].includes(grant.role) && grant.universityId)
        .map((grant) => grant.universityId as string);
      if (universityIds.length) visibility.push({ course: { programme: { department: { faculty: { universityId: { in: universityIds } } } } } });
    }
  }
  const where = {
    ...filters,
    ...(q ? { OR: [
      { title: { contains: q, mode: 'insensitive' as const } },
      { description: { contains: q, mode: 'insensitive' as const } },
      { course: { code: { contains: q, mode: 'insensitive' as const } } },
      { course: { title: { contains: q, mode: 'insensitive' as const } } },
    ] } : {}),
    ...((status || (!mine && !reviewQueue)) ? { status: status ?? 'APPROVED' as const } : {}),
    AND: [
      ...(!isSuperAdmin ? [{ OR: visibility }] : []),
      { trashedAt: null },
      { quarantinedAt: null },
      ...(mine && actor ? [{ uploadedById: actor.user.id }] : []),
      ...(reviewQueue ? [{ status: 'PENDING' as const }, { uploadedById: { not: actor?.user.id } }] : []),
      ...(!isSuperAdmin && status ? [{ status }] : []),
    ],
  };
  const [total, items] = await Promise.all([
    prisma.resource.count({ where }),
    prisma.resource.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: resourceInclude,
    }),
  ]);
  return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function findResourceById(resourceId: string, actor?: AuthContext) {
  const scope = await findResourceScope(resourceId);
  if (!scope || !canViewResource(scope as ResourceScopeRecord, actor)) return null;
  return prisma.resource.findUnique({ where: { id: resourceId }, include: resourceInclude });
}

export async function validateFileSignature(file: Express.Multer.File) {
  if (file.size < 1) throw new ApiError(400, 'EMPTY_RESOURCE_FILE', 'The uploaded file is empty.');
  const handle = await open(file.path, 'r');
  try {
    const buffer = Buffer.alloc(8);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead);
    const extension = extname(file.originalname).toLowerCase();
    const isPdf = header.subarray(0, 5).toString() === '%PDF-';
    const isZip = header[0] === 0x50 && header[1] === 0x4b;
    const isOle = header.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    const valid = extension === '.pdf' ? isPdf
      : ['.doc', '.ppt', '.xls'].includes(extension) ? isOle
        : ['.docx', '.pptx', '.xlsx'].includes(extension) ? isZip
          : extension === '.txt' && !header.includes(0);
    if (!valid) throw new ApiError(415, 'INVALID_RESOURCE_FILE_CONTENT', 'The file contents do not match its file type.');
  } finally {
    await handle.close();
  }
}

export async function createResource(input: CreateResourceInput, uploadedFile: Express.Multer.File, actor: AuthContext) {
  await validateAcademicContext(input);
  await validateFileSignature(uploadedFile);
  const originalFilename = basename(uploadedFile.originalname).replace(/[\r\n\0]/g, '').slice(0, 255);
  if (!originalFilename) throw new ApiError(400, 'INVALID_RESOURCE_FILENAME', 'The uploaded filename is invalid.');
  const stored = await resourceStorage.put(uploadedFile.path, originalFilename);
  try {
    return await prisma.resource.create({
      data: {
        ...input,
        status: 'PENDING',
        uploadedById: actor.user.id,
        file: { create: {
          provider: resourceStorage.provider,
          storageKey: stored.storageKey,
          originalFilename,
          mediaType: uploadedFile.mimetype,
          byteSize: uploadedFile.size,
        } },
      },
      include: resourceInclude,
    });
  } catch (error) {
    await resourceStorage.delete(stored.storageKey);
    throw error;
  } finally {
    await rm(uploadedFile.path, { force: true });
  }
}

export async function updateResource(resourceId: string, input: UpdateResourceInput, actor: AuthContext) {
  const current = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { courseId: true, academicSessionId: true, semesterId: true, status: true, uploadedById: true },
  });
  if (!current) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
  if (current.uploadedById !== actor.user.id) throw new ApiError(403, 'RESOURCE_OWNERSHIP_REQUIRED', 'Only the uploader can edit this resource.');
  if (current.status === 'REMOVED') throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');

  await validateAcademicContext({
    courseId: input.courseId ?? current.courseId,
    academicSessionId: input.academicSessionId === undefined ? current.academicSessionId : input.academicSessionId,
    semesterId: input.semesterId === undefined ? current.semesterId : input.semesterId,
  });

  return prisma.$transaction(async (transaction) => {
    const resource = await transaction.resource.update({
      where: { id: resourceId },
      data: { ...input, ...(current.status === 'APPROVED' || current.status === 'REJECTED' ? { status: 'PENDING' } : {}) },
      include: resourceInclude,
    });
    if (current.status === 'APPROVED' || current.status === 'REJECTED') {
      await transaction.moderationAction.create({ data: { resourceId, resourceIdSnapshot: resourceId, actorId: actor.user.id, action: 'RESUBMITTED' } });
    }
    return resource;
  });
}

export async function moderateResource(resourceId: string, action: 'APPROVED' | 'REJECTED', reason: string | undefined, actor: AuthContext) {
  const current = await findResourceScope(resourceId);
  if (!current) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
  if (current.uploadedById === actor.user.id && !hasRole(actor, 'SUPER_ADMIN')) throw new ApiError(403, 'SELF_MODERATION_FORBIDDEN', 'Moderators cannot moderate their own resource.');
  const universityId = current.course.programme.department.faculty.universityId;
  if (!hasRole(actor, 'SUPER_ADMIN') && !hasRoleInUniversity(actor, universityId, 'MODERATOR')) {
    throw new ApiError(403, 'FORBIDDEN', 'Only a Moderator in this university can approve or reject resources.');
  }
  if (current.trashedAt || current.quarantinedAt || current.status === 'REMOVED') throw new ApiError(409, 'RESOURCE_UNAVAILABLE', 'This resource is in Trash, quarantined, or unavailable.');
  if (current.status !== 'PENDING') throw new ApiError(409, 'RESOURCE_NOT_PENDING', 'Only pending resources can be approved or rejected.');
  const updated = await prisma.$transaction(async (transaction) => {
    const changed = await transaction.resource.updateMany({ where: { id: resourceId, status: 'PENDING', trashedAt: null, quarantinedAt: null }, data: { status: action } });
    if (!changed.count) throw new ApiError(409, 'RESOURCE_NOT_PENDING', 'This resource has already been reviewed.');
    const resource = await transaction.resource.findUniqueOrThrow({ where: { id: resourceId }, include: resourceInclude });
    await transaction.moderationAction.create({ data: { resourceId, resourceIdSnapshot: resourceId, actorId: actor.user.id, action, reason } });
    await transaction.resourceGovernanceEvent.create({ data: { resourceId, resourceIdSnapshot: resourceId, actorId: actor.user.id, actorRole: hasRole(actor, 'SUPER_ADMIN') ? 'SUPER_ADMIN' : 'MODERATOR', action: `MODERATION_${action}`, reason } });
    return resource;
  });
  return updated;
}

export async function findResourceFile(resourceId: string, actor?: AuthContext) {
  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { ...scopeSelect, file: { select: { provider: true, storageKey: true, originalFilename: true, mediaType: true } } },
  });
  if (!resource || !canViewResource(resource as ResourceScopeRecord, actor)) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
  if (!resource.file) throw new ApiError(404, 'RESOURCE_FILE_NOT_FOUND', 'The resource file was not found.');
  try {
    return { ...resource.file, stream: await getResourceStorage(resource.file.provider).get(resource.file.storageKey) };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      throw new ApiError(404, 'RESOURCE_FILE_NOT_FOUND', 'The resource file was not found.');
    }
    throw error;
  }
}
