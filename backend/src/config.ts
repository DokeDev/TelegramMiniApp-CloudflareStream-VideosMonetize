import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  APP_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(18763),
  HOST: z.string().default('127.0.0.1'),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1_048_576),
  FRONTEND_ORIGIN: z.string().default('http://localhost:19327'),
  SECURITY_HEADERS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(240),
  SERVE_FRONTEND: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  FRONTEND_DIST_DIR: z.string().default('../frontend/dist'),
  PUBLIC_BASE_URL: z.string().optional(),
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().default('admin123'),
  ADMIN_SESSION_SECRET: z.string().optional(),
  ADMIN_SESSION_TTL_SECONDS: z.coerce.number().default(43200),
  ADMIN_SESSION_BINDING: z
    .enum(['none', 'user-agent'])
    .default('user-agent'),
  ADMIN_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
  ADMIN_LOGIN_WINDOW_SECONDS: z.coerce.number().int().positive().default(600),
  ADMIN_LOGIN_LOCK_SECONDS: z.coerce.number().int().positive().default(900),
  ADMIN_ALLOW_PASSWORD_HEADER: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  DATABASE_URL: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  EXTERNAL_RECHARGE_SECRET: z.string().optional(),
  DEV_TELEGRAM_USER_ID: z.coerce.bigint().default(10001n),
  DEV_TELEGRAM_USERNAME: z.string().default('devbuyer'),
  CLOUDFLARE_STREAM_SIGNING_KEY_ID: z.string().optional(),
  CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY: z.string().optional(),
  CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN: z.string().optional(),
  TOKEN_TTL_SECONDS: z.coerce.number().default(900),
  OFFICIAL_WATERMARK_TEXT: z.string().default('Official'),
});

export const config = envSchema.parse(process.env);

export const isDevelopment = config.APP_ENV === 'development';
