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

const resourceFields = {
  courseId: uuid,
  academicSessionId: uuid.nullable().optional(),
  semesterId: uuid.nullable().optional(),
  title: z.string().trim().min(1).max(250),
  description: z.string().trim().max(10_000).nullable().optional(),
  type: z.enum(resourceTypes),
  sourceAttribution: z.string().trim().max(500).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
};

export const createResourceSchema = z.object(resourceFields).strict();
export const updateResourceSchema = z.object({
  courseId: resourceFields.courseId.optional(),
  academicSessionId: resourceFields.academicSessionId,
  semesterId: resourceFields.semesterId,
  title: resourceFields.title.optional(),
  description: resourceFields.description,
  type: resourceFields.type.optional(),
  sourceAttribution: resourceFields.sourceAttribution,
  tags: resourceFields.tags,
}).strict().refine((value) => Object.keys(value).length > 0, 'provide at least one field to update');

export const resourceIdParamsSchema = z.object({ resourceId: uuid });
export const requestIdParamsSchema = z.object({ requestId: uuid });
export const trashReasonSchema = z.object({ reason: z.string().trim().min(1).max(2000) }).strict();
export const quarantineSchema = z.object({ reason: z.string().trim().min(1).max(2000) }).strict();
export const deletionRequestSchema = z.object({
  category: z.enum(['DUPLICATE', 'INCORRECT_CLASSIFICATION', 'WRONG_COURSE', 'OUTDATED_MISLEADING', 'CORRUPTED_FILE', 'COPYRIGHT', 'PRIVACY', 'INAPPROPRIATE', 'OTHER']),
  explanation: z.string().trim().min(1).max(2000),
}).strict().refine((value) => value.category !== 'OTHER' || value.explanation.length > 0, 'an explanation is required for Other');
export const deletionDecisionSchema = z.object({ action: z.enum(['APPROVE', 'REJECT']), note: z.string().trim().max(2000).optional() }).strict();
export const purgeSchema = z.object({ confirmation: z.literal('PERMANENTLY_DELETE'), reason: z.string().trim().min(1).max(2000) }).strict();
export const resourceReportSchema = z.object({
  category: z.enum(['BROKEN_FILE', 'WRONG_CONTENT', 'COPYRIGHT', 'PRIVACY', 'INAPPROPRIATE', 'OTHER']),
  explanation: z.string().trim().min(1).max(2000),
}).strict();
export const reportDecisionSchema = z.object({ action: z.enum(['RESOLVED', 'DISMISSED']), note: z.string().trim().min(1).max(2000) }).strict();

export const listResourcesQuerySchema = z.object({
  courseId: uuid.optional(),
  q: z.string().trim().min(1).max(200).optional(),
  mine: z.enum(['true', 'false']).transform((value) => value === 'true').optional().default(false),
  reviewQueue: z.enum(['true', 'false']).transform((value) => value === 'true').optional().default(false),
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
