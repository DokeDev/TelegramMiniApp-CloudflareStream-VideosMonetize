import cors from '@fastify/cors';
import fastify from 'fastify';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { registerAdminRoutes } from './admin.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { registerRoutes } from './routes.js';

const app = fastify({
  logger: true,
  bodyLimit: config.BODY_LIMIT_BYTES,
  trustProxy: config.TRUST_PROXY,
});

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitRecord>();
const rateLimitCleanup = windowlessInterval(() => {
  const now = Date.now();

  for (const [key, record] of rateLimitBuckets.entries()) {
    if (record.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}, Math.max(60_000, config.RATE_LIMIT_WINDOW_SECONDS * 1000));

function windowlessInterval(callback: () => void, ms: number) {
  const timer = setInterval(callback, ms);
  timer.unref();

  return timer;
}

function rateLimitKey(request: FastifyRequest) {
  const url = new URL(request.url, 'http://localhost');
  const scope = url.pathname.startsWith('/api/admin/login')
    ? 'admin-login'
    : url.pathname.startsWith('/api/')
      ? 'api'
      : 'page';

  return `${request.ip}:${scope}`;
}

await app.register(cors, {
  origin:
    config.FRONTEND_ORIGIN === '*'
      ? true
      : config.FRONTEND_ORIGIN.split(',').map((origin) => origin.trim()),
});

app.addHook('onRequest', async (request, reply) => {
  const url = new URL(request.url, 'http://localhost');

  if (config.RATE_LIMIT_ENABLED && url.pathname !== '/health' && url.pathname !== '/ready') {
    const now = Date.now();
    const windowMs = config.RATE_LIMIT_WINDOW_SECONDS * 1000;
    const key = rateLimitKey(request);
    const current = rateLimitBuckets.get(key);
    const record =
      current && current.resetAt > now
        ? current
        : {
            count: 0,
            resetAt: now + windowMs,
          };

    record.count += 1;
    rateLimitBuckets.set(key, record);
    reply.header('X-RateLimit-Limit', String(config.RATE_LIMIT_MAX));
    reply.header('X-RateLimit-Remaining', String(Math.max(0, config.RATE_LIMIT_MAX - record.count)));
    reply.header('X-RateLimit-Reset', String(Math.ceil(record.resetAt / 1000)));

    if (record.count > config.RATE_LIMIT_MAX) {
      reply.header('Retry-After', String(Math.ceil((record.resetAt - now) / 1000)));
      reply.status(429).send({ error: '请求过于频繁，请稍后再试' });
      return;
    }
  }

  reply.header('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');

  if (config.SECURITY_HEADERS_ENABLED) {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
  }
});

await registerRoutes(app);
await registerAdminRoutes(app);

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

async function fileExists(path: string) {
  try {
    const fileStat = await stat(path);
    return fileStat.isFile();
  } catch {
    return false;
  }
}

if (config.SERVE_FRONTEND) {
  const frontendDistDir = resolve(process.cwd(), config.FRONTEND_DIST_DIR);

  app.setNotFoundHandler(async (request, reply) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      reply.status(404).send({ error: 'Not Found' });
      return;
    }

    const url = new URL(request.url, 'http://localhost');

    if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
      reply.status(404).send({ error: 'Not Found' });
      return;
    }

    const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const staticPath = resolve(frontendDistDir, `.${requestedPath}`);
    const indexPath = resolve(frontendDistDir, 'index.html');
    const targetPath =
      staticPath.startsWith(frontendDistDir) && (await fileExists(staticPath))
        ? staticPath
        : indexPath;

    if (!targetPath.startsWith(frontendDistDir) || !(await fileExists(targetPath))) {
      reply.status(404).send({ error: 'Frontend build not found' });
      return;
    }

    reply.type(contentTypes[extname(targetPath)] || 'application/octet-stream');
    reply.send(await readFile(targetPath));
  });
}

app.setErrorHandler((
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  request.log.error(error);

  const statusCode =
    error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

  reply.status(statusCode).send({
    error: statusCode === 500 ? 'Internal Server Error' : error.message,
  });
});

await app.listen({
  port: config.PORT,
  host: config.HOST,
});

async function shutdown(signal: NodeJS.Signals) {
  app.log.info({ signal }, 'shutting down');

  clearInterval(rateLimitCleanup);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});
