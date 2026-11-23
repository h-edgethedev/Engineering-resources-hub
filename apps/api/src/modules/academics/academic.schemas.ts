import { z } from 'zod';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase slug');

export const universityParamsSchema = z.object({ slug });

export const universitySlugParamsSchema = z.object({ universitySlug: slug });

export const facultyParamsSchema = universitySlugParamsSchema.extend({ facultySlug: slug });

export const departmentParamsSchema = z.object({
  universitySlug: slug,
  facultySlug: slug,
  departmentSlug: slug,
});

export const programmeParamsSchema = departmentParamsSchema.extend({ programmeSlug: slug });

export const courseParamsSchema = z.object({ courseId: z.uuid() });

export const courseFiltersSchema = z.object({
  university: slug.optional(),
  faculty: slug.optional(),
  department: slug.optional(),
  q: z.string().trim().min(1).max(200).optional(),
  level: z.string().regex(/^\d{3}$/, 'must be a three-digit academic level').optional(),
  session: z.string().regex(/^\d{4}\/\d{4}$/, 'must use the YYYY/YYYY format').optional(),
  semester: slug.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

