import { z } from 'zod';

const uuid = z.uuid();

export const resourceTypes = [
  'LECTURE_NOTE',
  'TEXTBOOK',
  'PAST_QUESTION',
  'SOLUTION',
  'LAB_MANUAL',
  'PROGRAMMING_EXERCISE',
  'OTHER',
] as const;

export const resourceStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'REMOVED'] as const;

const resourceFileSchema = z.object({
  provider: z.string().trim().min(1).max(50),
  storageKey: z.string().trim().min(1).max(1024),
  originalFilename: z.string().trim().min(1).max(255),
  mediaType: z.string().regex(/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/, 'must be a valid media type'),
  byteSize: z.number().int().positive().max(2_147_483_647),
}).strict();

const resourceFields = {
  courseId: uuid,
  academicSessionId: uuid.nullable().optional(),
  semesterId: uuid.nullable().optional(),
  title: z.string().trim().min(1).max(250),
  description: z.string().trim().max(10_000).nullable().optional(),
  type: z.enum(resourceTypes),
  file: resourceFileSchema,
};

export const createResourceSchema = z.object(resourceFields).strict();
export const updateResourceSchema = z.object({
  courseId: resourceFields.courseId.optional(),
  academicSessionId: resourceFields.academicSessionId,
  semesterId: resourceFields.semesterId,
  title: resourceFields.title.optional(),
  description: resourceFields.description,
  type: resourceFields.type.optional(),
  file: resourceFields.file.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'provide at least one field to update');

export const resourceIdParamsSchema = z.object({ resourceId: uuid });

export const listResourcesQuerySchema = z.object({
  courseId: uuid.optional(),
  type: z.enum(resourceTypes).optional(),
  status: z.enum(resourceStatuses).optional(),
  academicSessionId: uuid.optional(),
  semesterId: uuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
export type ListResourcesQuery = z.infer<typeof listResourcesQuerySchema>;
