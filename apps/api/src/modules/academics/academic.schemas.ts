import { z } from 'zod';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase slug');

export const universityParamsSchema = z.object({ slug });

export const departmentParamsSchema = z.object({
  universitySlug: slug,
  facultySlug: slug,
  departmentSlug: slug,
});
