import { z } from 'zod';

export const adminUsersQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
