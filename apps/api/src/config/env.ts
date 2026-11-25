import 'dotenv/config';
import { resolve } from 'node:path';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => {
      try {
        return ['postgres:', 'postgresql:'].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    }, 'must be a valid PostgreSQL connection URL'),
  RESOURCE_STORAGE_DIR: z.string().min(1).default(resolve(process.cwd(), '.data/uploads')),
  RESOURCE_STORAGE_PROVIDER: z.enum(['local', 'r2']).default('local'),
  R2_ENDPOINT: z.string().url().refine((value) => new URL(value).protocol === 'https:', 'must use HTTPS').optional(),
  R2_BUCKET_NAME: z.string().trim().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
  RESOURCE_MAX_FILE_SIZE_BYTES: z.coerce.number().int().min(1).max(100 * 1024 * 1024).default(20 * 1024 * 1024),
  RESOURCE_PURGE_INTERVAL_MS: z.coerce.number().int().min(60_000).default(24 * 60 * 60 * 1000),
  EMAIL_SMTP_URL: z.string().url().refine((value) => {
    try { return ['smtp:', 'smtps:'].includes(new URL(value).protocol); }
    catch { return false; }
  }, 'must use smtp: or smtps:').optional(),
  EMAIL_FROM: z.string().trim().min(3).optional(),
}).superRefine((values, context) => {
  const r2Keys = ['R2_ENDPOINT', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] as const;
  const hasR2Configuration = r2Keys.some((key) => Boolean(values[key]));
  if (values.RESOURCE_STORAGE_PROVIDER === 'r2' || hasR2Configuration) {
    for (const key of r2Keys) {
      if (!values[key]) context.addIssue({ code: 'custom', path: [key], message: 'is required when configuring R2 storage.' });
    }
  }
  if (Boolean(values.EMAIL_SMTP_URL) !== Boolean(values.EMAIL_FROM)) {
    context.addIssue({ code: 'custom', path: ['EMAIL_SMTP_URL'], message: 'EMAIL_SMTP_URL and EMAIL_FROM must be configured together.' });
  }
  if (values.NODE_ENV === 'production' && (!values.EMAIL_SMTP_URL || !values.EMAIL_FROM)) {
    context.addIssue({ code: 'custom', path: ['EMAIL_SMTP_URL'], message: 'SMTP email delivery must be configured in production.' });
  }
});

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  const summary = result.error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${summary}`);
}

export const env = {
  nodeEnv: result.data.NODE_ENV,
  apiPort: result.data.API_PORT,
  webOrigin: result.data.WEB_ORIGIN,
  databaseUrl: result.data.DATABASE_URL,
  resourceStorageDir: result.data.RESOURCE_STORAGE_DIR,
  resourceStorageProvider: result.data.RESOURCE_STORAGE_PROVIDER,
  r2Endpoint: result.data.R2_ENDPOINT,
  r2BucketName: result.data.R2_BUCKET_NAME,
  r2AccessKeyId: result.data.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: result.data.R2_SECRET_ACCESS_KEY,
  resourceMaxFileSizeBytes: result.data.RESOURCE_MAX_FILE_SIZE_BYTES,
  resourcePurgeIntervalMs: result.data.RESOURCE_PURGE_INTERVAL_MS,
  emailSmtpUrl: result.data.EMAIL_SMTP_URL,
  emailFrom: result.data.EMAIL_FROM,
} as const;
