import 'dotenv/config';
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
} as const;
