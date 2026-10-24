import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('4000').transform(Number),
  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('30d'),
  JWT_REFRESH_EXPIRY_DAYS: z.string().default('60').transform(Number),
  CORS_ORIGIN: z.string(), // comma-separated allowed origins
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_STORAGE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_BUCKET_PROFILES: z.string().default('profiles'),
  SUPABASE_BUCKET_ATTENDANCE: z.string().default('attendance'),
  SUPABASE_BUCKET_DAMAGE: z.string().default('damage'),
  MAX_UPLOAD_MB: z.string().default('5').transform(Number),
  RATE_LIMIT_WINDOW_MS: z.string().default('900000').transform(Number),
  RATE_LIMIT_LOGIN_MAX: z.string().default('10').transform(Number),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.format();
    console.error('[CONFIG] Invalid environment variables:', JSON.stringify(errors, null, 2));
    process.exit(1);
  }
  return result.data;
}

export const env = parseEnv();
export const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
