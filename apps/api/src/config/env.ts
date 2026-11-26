import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .preprocess((v) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase())), z.boolean())
    .default(def);

const optionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

const DEV_JWT_SECRET = 'dev-only-insecure-secret-change-me-0123456789abcdef';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: optionalString,
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').default(DEV_JWT_SECRET),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    COOKIE_SECURE: bool(false),
    /** Comma-separated origins allowed to make state-changing requests (CSRF check). */
    APP_ORIGINS: z.string().default('http://localhost:3000'),
    TRUST_PROXY: bool(true),

    GEMINI_API_KEY: optionalString,
    OPENAI_API_KEY: optionalString,
    OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
    GROQ_API_KEY: optionalString,
    OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
    LLM_PROVIDER: optionalString,
    LLM_MODEL: optionalString,
    LLM_FALLBACK_PROVIDER: optionalString,

    FETCH_USER_AGENT: z.string().default('DailyJobUpdatesBot/1.0 (+job aggregation; respects robots.txt)'),
    FETCH_TIMEOUT_MS: z.coerce.number().int().default(15_000),
    FETCH_MAX_BYTES: z.coerce.number().int().default(3_000_000),
    FETCH_MAX_REDIRECTS: z.coerce.number().int().default(5),
    FETCH_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    FETCH_HOST_INTERVAL_MS: z.coerce.number().int().default(1_000),
    ALLOW_LOOPBACK_FETCH: bool(false),
    ENABLE_BROWSER_RENDERING: bool(true),
    BROWSER_TIMEOUT_MS: z.coerce.number().int().default(25_000),

    RUN_WORKER_IN_PROCESS: bool(true),
    EXTRACTION_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
    MAINTENANCE_INTERVAL_MS: z.coerce.number().int().min(10_000).default(300_000),
    EXTRACTION_RATE_LIMIT_PER_MIN: z.coerce.number().int().default(20),
    AUTH_RATE_LIMIT_PER_MIN: z.coerce.number().int().default(10),

    SEED_ADMIN_EMAIL: z.string().email().default('admin@jobportal.local'),
    SEED_ADMIN_PASSWORD: z.string().min(8).default('ChangeMe123!'),
    SEED_SAMPLE_DATA: bool(true),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.JWT_SECRET === DEV_JWT_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'Set a strong JWT_SECRET in production' });
    }
    if (env.NODE_ENV === 'production' && env.ALLOW_LOOPBACK_FETCH) {
      ctx.addIssue({ code: 'custom', path: ['ALLOW_LOOPBACK_FETCH'], message: 'Must be false in production' });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export function appOrigins(env: Env): string[] {
  return env.APP_ORIGINS.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
}
