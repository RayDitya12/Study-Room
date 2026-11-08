import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Load the repo-root .env (works from both src/ and dist/: both are two levels down).
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '../../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1).optional(),
  STORE: z.enum(['prisma', 'memory']).default('prisma'),
  PRESENCE_GRACE_MS: z.coerce.number().int().min(0).default(15000),
  MAX_MEMBERS: z.coerce.number().int().min(1).max(30).default(30),
  ROOM_TTL_DAYS: z.coerce.number().int().min(0).default(7),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.') || '(env)'}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;
// `npm run dev:memory` passes --memory. An argv flag keeps the no-database quick
// start working in every shell without adding cross-env as a dependency.
const memoryFlag = process.argv.includes('--memory');
let store: 'prisma' | 'memory' = memoryFlag ? 'memory' : env.STORE;
if (!memoryFlag && store === 'prisma' && !env.DATABASE_URL) {
  console.warn('[config] STORE=prisma but DATABASE_URL is not set — falling back to the in-memory store.');
  store = 'memory';
}

export const config = {
  ...env,
  STORE: store,
  corsOrigins: env.CORS_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0),
};

export type AppConfig = typeof config;
