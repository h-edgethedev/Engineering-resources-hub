import { z } from 'zod';

const password = z.string().min(12).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'must not exceed 72 UTF-8 bytes');

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  displayName: z.string().trim().min(1).max(100),
  password,
}).strict();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(1).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'must not exceed 72 UTF-8 bytes'),
}).strict();

export const verifyEmailSchema = z.object({ token: z.string().min(32).max(256) }).strict();
export const resendVerificationSchema = z.object({ email: z.string().trim().toLowerCase().max(254).pipe(z.email()) }).strict();

export const grantRoleSchema = z.object({
  role: z.enum(['SUPER_ADMIN', 'UNIVERSITY_ADMIN', 'MODERATOR', 'CONTRIBUTOR', 'STUDENT']),
  universityId: z.uuid().nullable().optional(),
}).strict();

export const moderationSchema = z.object({
  action: z.enum(['APPROVED', 'REJECTED', 'REMOVED']),
  reason: z.string().trim().min(1).max(2000).optional(),
}).strict().refine((value) => value.action === 'APPROVED' || Boolean(value.reason), 'a reason is required for rejection or removal');

export const userIdParamsSchema = z.object({ userId: z.uuid() });
export const grantIdParamsSchema = z.object({ grantId: z.uuid() });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
