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
  RESOURCE_MAX_FILE_SIZE_BYTES: z.coerce.number().int().min(1).max(100 * 1024 * 1024).default(20 * 1024 * 1024),
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
  resourceMaxFileSizeBytes: result.data.RESOURCE_MAX_FILE_SIZE_BYTES,
} as const;
