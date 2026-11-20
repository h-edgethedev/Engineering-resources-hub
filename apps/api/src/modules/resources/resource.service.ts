import { ApiError } from '../../errors/ApiError.js';
import { prisma } from '../../infrastructure/database.js';
import type { CreateResourceInput, ListResourcesQuery, UpdateResourceInput } from './resource.schemas.js';

const resourceInclude = {
  course: { select: { id: true, code: true, title: true } },
  academicSession: { select: { id: true, label: true } },
  semester: { select: { id: true, code: true, label: true, programmeLevel: { select: { code: true, label: true } } } },
  file: { select: { id: true, provider: true, storageKey: true, originalFilename: true, mediaType: true, byteSize: true } },
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

export async function createResource(input: CreateResourceInput) {
  await validateAcademicContext(input);
  const { file, ...resource } = input;
  return prisma.resource.create({
    data: { ...resource, status: 'PENDING', file: { create: file } },
    include: resourceInclude,
  });
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

  const { file, ...fields } = input;
  return prisma.resource.update({
    where: { id: resourceId },
    data: {
      ...fields,
      ...(file ? { file: { upsert: { create: file, update: file } } } : {}),
    },
    include: resourceInclude,
  });
}

export async function deleteResource(resourceId: string) {
  const current = await prisma.resource.findUnique({ where: { id: resourceId }, select: { id: true } });
  if (!current) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
  await prisma.resource.delete({ where: { id: resourceId } });
}
