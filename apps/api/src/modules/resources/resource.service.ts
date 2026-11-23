import { ApiError } from '../../errors/ApiError.js';
import { prisma } from '../../infrastructure/database.js';
import { resourceStorage } from './storage.js';
import type { Express } from 'express';
import { open } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { rm } from 'node:fs/promises';
import type { CreateResourceInput, ListResourcesQuery, UpdateResourceInput } from './resource.schemas.js';
import { hasRole, hasRoleInUniversity } from '../auth/auth.middleware.js';
import type { AuthContext } from '../auth/auth.types.js';

const resourceInclude = {
  course: { select: { id: true, code: true, title: true } },
  academicSession: { select: { id: true, label: true } },
  semester: { select: { id: true, code: true, label: true, programmeLevel: { select: { code: true, label: true } } } },
  file: { select: { id: true, provider: true, originalFilename: true, mediaType: true, byteSize: true } },
  uploader: { select: { id: true, displayName: true } },
} as const;

const scopeSelect = {
  id: true,
  status: true,
  uploadedById: true,
  course: { select: { programme: { select: { department: { select: { faculty: { select: { universityId: true } } } } } } } },
  file: { select: { provider: true, storageKey: true } },
} as const;

type ResourceScopeRecord = {
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REMOVED';
  uploadedById: string | null;
  course: { programme: { department: { faculty: { universityId: string } } } };
};

function canViewResource(resource: ResourceScopeRecord, actor?: AuthContext) {
  if (resource.status === 'APPROVED') return true;
  if (!actor) return false;
  if (resource.uploadedById === actor.user.id) return true;
  const universityId = resource.course.programme.department.faculty.universityId;
  return hasRole(actor, 'SUPER_ADMIN') || hasRoleInUniversity(actor, universityId, 'UNIVERSITY_ADMIN', 'MODERATOR');
}

function canManageResource(resource: ResourceScopeRecord, actor: AuthContext) {
  if (resource.uploadedById === actor.user.id) return true;
  const universityId = resource.course.programme.department.faculty.universityId;
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
  const { page, pageSize, status, q, reviewQueue, ...filters } = query;
  if (reviewQueue && (!actor || !hasRole(actor, 'SUPER_ADMIN', 'MODERATOR'))) {
    throw new ApiError(403, 'FORBIDDEN', 'Only moderators and Super Administrators can view the review queue.');
  }
  const visibility: object[] = [{ status: 'APPROVED' }];
  if (actor) {
    visibility.push({ uploadedById: actor.user.id });
    if (hasRole(actor, 'SUPER_ADMIN')) visibility.push({});
    else {
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
    ...(actor?.user.roleAssignments.some((grant) => grant.role === 'SUPER_ADMIN') ? (status ? { status } : {}) : {}),
    AND: [
      { OR: visibility },
      ...(reviewQueue ? [{ status: 'PENDING' as const }, { uploadedById: { not: actor?.user.id } }] : []),
      ...(!actor?.user.roleAssignments.some((grant) => grant.role === 'SUPER_ADMIN') && status ? [{ status }] : []),
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

async function validateFileSignature(file: Express.Multer.File) {
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
      await transaction.moderationAction.create({ data: { resourceId, actorId: actor.user.id, action: 'RESUBMITTED' } });
    }
    return resource;
  });
}

export async function deleteResource(resourceId: string, actor: AuthContext) {
  const current = await findResourceScope(resourceId);
  if (!current) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
  if (!canManageResource(current as ResourceScopeRecord, actor)) throw new ApiError(403, 'RESOURCE_OWNERSHIP_REQUIRED', 'You cannot remove this resource.');
  if (current.status === 'REMOVED') {
    if (current.file?.provider === resourceStorage.provider) await resourceStorage.delete(current.file.storageKey);
    return;
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.resource.update({ where: { id: resourceId }, data: { status: 'REMOVED' } });
    await transaction.moderationAction.create({ data: { resourceId, actorId: actor.user.id, action: 'REMOVED' } });
  });
  if (current.file?.provider === resourceStorage.provider) await resourceStorage.delete(current.file.storageKey);
}

export async function moderateResource(resourceId: string, action: 'APPROVED' | 'REJECTED' | 'REMOVED', reason: string | undefined, actor: AuthContext) {
  const current = await findResourceScope(resourceId);
  if (!current) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
  if (current.uploadedById === actor.user.id) throw new ApiError(403, 'SELF_MODERATION_FORBIDDEN', 'You cannot moderate your own resource.');
  const universityId = current.course.programme.department.faculty.universityId;
  if (action === 'REMOVED') {
    if (!hasRole(actor, 'SUPER_ADMIN') && !hasRoleInUniversity(actor, universityId, 'UNIVERSITY_ADMIN', 'MODERATOR')) throw new ApiError(403, 'FORBIDDEN', 'You cannot remove this resource.');
  } else if (!hasRole(actor, 'SUPER_ADMIN') && !hasRoleInUniversity(actor, universityId, 'MODERATOR')) {
    throw new ApiError(403, 'FORBIDDEN', 'Only a Moderator in this university can approve or reject resources.');
  }
  if (current.status === 'REMOVED') {
    if (action !== 'REMOVED') throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
    if (current.file?.provider === resourceStorage.provider) await resourceStorage.delete(current.file.storageKey);
    return prisma.resource.findUniqueOrThrow({ where: { id: resourceId }, include: resourceInclude });
  }
  if (current.status !== 'PENDING' && action !== 'REMOVED') throw new ApiError(409, 'RESOURCE_NOT_PENDING', 'Only pending resources can be approved or rejected.');
  const updated = await prisma.$transaction(async (transaction) => {
    const resource = await transaction.resource.update({ where: { id: resourceId }, data: { status: action }, include: resourceInclude });
    await transaction.moderationAction.create({ data: { resourceId, actorId: actor.user.id, action, reason } });
    return resource;
  });
  if (action === 'REMOVED' && current.file?.provider === resourceStorage.provider) await resourceStorage.delete(current.file.storageKey);
  return updated;
}

export async function findResourceFile(resourceId: string, actor?: AuthContext) {
  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { ...scopeSelect, file: { select: { provider: true, storageKey: true, originalFilename: true, mediaType: true } } },
  });
  if (!resource || !canViewResource(resource as ResourceScopeRecord, actor)) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
  if (!resource.file || resource.file.provider !== resourceStorage.provider) throw new ApiError(404, 'RESOURCE_FILE_NOT_FOUND', 'The resource file was not found.');
  try {
    return { ...resource.file, stream: await resourceStorage.get(resource.file.storageKey) };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      throw new ApiError(404, 'RESOURCE_FILE_NOT_FOUND', 'The resource file was not found.');
    }
    throw error;
  }
}
