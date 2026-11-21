import { ApiError } from '../../errors/ApiError.js';
import { prisma } from '../../infrastructure/database.js';
import { resourceStorage } from './storage.js';
import type { Express } from 'express';
import { open } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { rm } from 'node:fs/promises';
import type { CreateResourceInput, ListResourcesQuery, UpdateResourceInput } from './resource.schemas.js';

const resourceInclude = {
  course: { select: { id: true, code: true, title: true } },
  academicSession: { select: { id: true, label: true } },
  semester: { select: { id: true, code: true, label: true, programmeLevel: { select: { code: true, label: true } } } },
  file: { select: { id: true, provider: true, originalFilename: true, mediaType: true, byteSize: true } },
} as const;

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

export async function listResources(query: ListResourcesQuery) {
  const { page, pageSize, ...filters } = query;
  const where = filters;
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

export async function findResourceById(resourceId: string) {
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

export async function createResource(input: CreateResourceInput, uploadedFile: Express.Multer.File) {
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

export async function updateResource(resourceId: string, input: UpdateResourceInput) {
  const current = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { courseId: true, academicSessionId: true, semesterId: true },
  });
  if (!current) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');

  await validateAcademicContext({
    courseId: input.courseId ?? current.courseId,
    academicSessionId: input.academicSessionId === undefined ? current.academicSessionId : input.academicSessionId,
    semesterId: input.semesterId === undefined ? current.semesterId : input.semesterId,
  });

  return prisma.resource.update({
    where: { id: resourceId },
    data: {
      ...input,
    },
    include: resourceInclude,
  });
}

export async function deleteResource(resourceId: string) {
  const current = await prisma.resource.findUnique({ where: { id: resourceId }, select: { id: true, file: { select: { provider: true, storageKey: true } } } });
  if (!current) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
  await prisma.resource.delete({ where: { id: resourceId } });
  if (current.file?.provider === resourceStorage.provider) await resourceStorage.delete(current.file.storageKey);
}

export async function findResourceFile(resourceId: string) {
  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { id: true, status: true, file: { select: { provider: true, storageKey: true, originalFilename: true, mediaType: true } } },
  });
  if (!resource) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
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
