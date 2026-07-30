import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { logActivity } from './activity.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { markOrderPaidFromTelegram } from './payments.js';
import {
  getRuntimeSettings,
  maskSecret,
  settingKeys,
  upsertSetting,
} from './settings.js';
import { cleanTelegramUsername, normalizeTelegramUsername } from './username.js';

type AdminSessionPayload = {
  sub: 'admin';
  username: string;
  iat: number;
  exp: number;
  jti: string;
  fingerprint?: string;
};

type LoginAttempt = {
  count: number;
  lockedUntil?: number;
  lastFailedAt: number;
};

const loginAttempts = new Map<string, LoginAttempt>();

function adminSessionSecret() {
  return config.ADMIN_SESSION_SECRET || config.ADMIN_PASSWORD;
}

function secureEqual(left: string, right: string) {
  const leftHash = createHash('sha256').update(left).digest();
  const rightHash = createHash('sha256').update(right).digest();

  return timingSafeEqual(leftHash, rightHash);
}

function signAdminPayload(payload: string) {
  return createHmac('sha256', adminSessionSecret()).update(payload).digest('base64url');
}

function requestFingerprint(request: FastifyRequest) {
  if (config.ADMIN_SESSION_BINDING === 'none') {
    return undefined;
  }

  const userAgent = request.headers['user-agent']?.toString() || '';

  return createHash('sha256').update(userAgent).digest('base64url');
}

function createAdminToken(request: FastifyRequest) {
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    sub: 'admin',
    username: config.ADMIN_USERNAME,
    iat: now,
    exp: now + config.ADMIN_SESSION_TTL_SECONDS,
    jti: randomUUID(),
    fingerprint: requestFingerprint(request),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  return {
    token: `${encodedPayload}.${signAdminPayload(encodedPayload)}`,
    expiresAt: new Date(payload.exp * 1000),
  };
}

function verifyAdminToken(token: string, request: FastifyRequest) {
  const [encodedPayload, signature] = token.split('.');

  if (!encodedPayload || !signature) {
    return false;
  }

  if (!secureEqual(signature, signAdminPayload(encodedPayload))) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as Partial<AdminSessionPayload>;

    return (
      payload.sub === 'admin' &&
      payload.username === config.ADMIN_USERNAME &&
      typeof payload.exp === 'number' &&
      payload.exp > Math.floor(Date.now() / 1000) &&
      payload.fingerprint === requestFingerprint(request)
    );
  } catch {
    return false;
  }
}

function adminBearerToken(request: FastifyRequest) {
  return request.headers.authorization?.replace(/^bearer\s+/i, '').trim();
}

function loginAttemptKey(request: FastifyRequest, username?: string) {
  const normalizedUsername = username?.trim().toLowerCase() || 'unknown';
  const usernameHash = createHash('sha256').update(normalizedUsername).digest('base64url');

  return `${request.ip || 'unknown'}:${usernameHash}`;
}

function assertLoginAllowed(request: FastifyRequest, username: string) {
  const key = loginAttemptKey(request, username);
  const attempt = loginAttempts.get(key);
  const now = Date.now();
  const loginWindowMs = config.ADMIN_LOGIN_WINDOW_SECONDS * 1000;

  if (!attempt) {
    return;
  }

  if (attempt.lockedUntil && attempt.lockedUntil > now) {
    const error = new Error('登录尝试过多，请稍后再试');
    Object.assign(error, { statusCode: 429 });
    throw error;
  }

  if (now - attempt.lastFailedAt > loginWindowMs) {
    loginAttempts.delete(key);
  }
}

function recordLoginFailure(request: FastifyRequest, username: string) {
  const key = loginAttemptKey(request, username);
  const now = Date.now();
  const current = loginAttempts.get(key);
  const loginWindowMs = config.ADMIN_LOGIN_WINDOW_SECONDS * 1000;
  const count =
    current && now - current.lastFailedAt <= loginWindowMs ? current.count + 1 : 1;

  loginAttempts.set(key, {
    count,
    lastFailedAt: now,
    lockedUntil:
      count >= config.ADMIN_LOGIN_MAX_ATTEMPTS
        ? now + config.ADMIN_LOGIN_LOCK_SECONDS * 1000
        : undefined,
  });
}

function clearLoginFailures(request: FastifyRequest, username: string) {
  loginAttempts.delete(loginAttemptKey(request, username));
}

function assertAdmin(request: FastifyRequest) {
  const token =
    adminBearerToken(request) || request.headers['x-admin-token']?.toString();
  const password = request.headers['x-admin-password']?.toString();

  if (token && verifyAdminToken(token, request)) {
    return;
  }

  if (
    config.ADMIN_ALLOW_PASSWORD_HEADER &&
    password &&
    secureEqual(password, config.ADMIN_PASSWORD)
  ) {
    return;
  }

  const error = new Error('Invalid admin session');
  Object.assign(error, { statusCode: 401 });
  throw error;
}

function settingStatus(value: string | undefined, revealValue = false) {
  return {
    value: revealValue ? value || '' : '',
    hasValue: Boolean(value),
    masked: maskSecret(value),
  };
}

async function telegramGetMe(botToken: string) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const body = (await response.json()) as {
    ok: boolean;
    result?: {
      id: number;
      username?: string;
      first_name?: string;
    };
    description?: string;
  };

  if (!response.ok || !body.ok) {
    throw new Error(body.description || 'Telegram Bot Token 测试失败');
  }

  return body.result;
}

async function cloudflareFetch<T>(path: string, init: RequestInit = {}) {
  const settings = await getRuntimeSettings();

  if (!settings.cloudflareAccountId || !settings.cloudflareApiToken) {
    throw new Error('Cloudflare Account ID 或 API Token 未配置');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${settings.cloudflareAccountId}${path}`,
    {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${settings.cloudflareApiToken}`,
      },
    },
  );

  const body = (await response.json()) as {
    success: boolean;
    errors?: Array<{ message: string }>;
    result: T;
  };

  if (!response.ok || !body.success) {
    const message = body.errors?.[0]?.message || 'Cloudflare Stream 测试失败';
    throw new Error(message);
  }

  return body.result;
}

function decodeCloudflarePem(pem: string) {
  const decoded = Buffer.from(pem, 'base64').toString('utf8').trim();

  if (!decoded.includes('PRIVATE KEY')) {
    throw new Error('Cloudflare 返回的 Signing Private Key 格式不正确');
  }

  return decoded;
}

const videoBodySchema = z.object({
  seriesId: z.coerce.number().int().positive().nullable().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  coverImageUrl: z.string().trim().max(500).optional(),
  cloudflareVideoUid: z.string().min(1),
  priceCents: z.coerce.number().int().nonnegative(),
  priceCredits: z.coerce.number().int().nonnegative().optional(),
  currency: z.string().min(1).default('XTR'),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('ACTIVE'),
  sortOrder: z.coerce.number().int().default(0),
});

const seriesBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  slug: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('ACTIVE'),
  sortOrder: z.coerce.number().int().default(0),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const listQuerySchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  provider: z.string().optional(),
  seriesId: z.string().optional(),
});

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || `series-${Date.now()}`
  );
}

function creditsFromStars(starsAmount: number) {
  return Math.max(1, starsAmount - 20);
}

async function uniqueSeriesSlug(input: string, excludeId?: number) {
  const base = slugify(input);
  let slug = base;
  let index = 2;

  while (
    await prisma.series.findFirst({
      where: {
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    })
  ) {
    slug = `${base}-${index}`;
    index += 1;
  }

  return slug;
}

function serializeUser(user: {
  id: number;
  telegramUserId: bigint;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  status: string;
  bannedAt: Date | null;
  banReason: string | null;
  riskScore: number;
  creditBalance: number;
  createdAt: Date;
}) {
  return {
    id: user.id,
    telegramUserId: user.telegramUserId.toString(),
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    languageCode: user.languageCode,
    status: user.status,
    bannedAt: user.bannedAt?.toISOString() || null,
    banReason: user.banReason,
    riskScore: user.riskScore,
    creditBalance: user.creditBalance,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.post('/api/admin/login', async (request, reply) => {
    const body = z
      .object({
        username: z.string().trim().min(1),
        password: z.string().min(1),
      })
      .parse(request.body);

    assertLoginAllowed(request, body.username);

    if (
      !secureEqual(body.username, config.ADMIN_USERNAME) ||
      !secureEqual(body.password, config.ADMIN_PASSWORD)
    ) {
      recordLoginFailure(request, body.username);

      await logActivity({
        actorType: 'admin',
        action: 'admin.login_failed',
        entityType: 'adminSession',
        message: '后台登录失败',
        request,
      });

      const error = new Error('登录失败，请检查用户名或密码');
      Object.assign(error, { statusCode: 401 });
      throw error;
    }

    clearLoginFailures(request, body.username);
    const session = createAdminToken(request);

    await logActivity({
      actorType: 'admin',
      action: 'admin.login',
      entityType: 'adminSession',
      message: '后台登录成功',
      request,
    });

    reply.code(201);

    return {
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
    };
  });

  app.get('/api/admin/session', async (request) => {
    assertAdmin(request);

    return {
      ok: true,
    };
  });

  app.get('/api/admin/overview', async (request) => {
    assertAdmin(request);
    const chartSince = new Date();
    chartSince.setHours(0, 0, 0, 0);
    chartSince.setDate(chartSince.getDate() - 6);

    const [
      userCount,
      seriesCount,
      videoCount,
      activeVideoCount,
      orderCount,
      paidOrderCount,
      activeEntitlementCount,
      playSessionCount,
      openRiskEventCount,
      bannedUserCount,
      metricOrders,
      metricPlaySessions,
      metricRiskEvents,
      recentOrders,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.series.count(),
      prisma.video.count(),
      prisma.video.count({ where: { status: 'ACTIVE' } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: 'PAID' } }),
      prisma.entitlement.count({ where: { status: 'ACTIVE' } }),
      prisma.playSession.count(),
      prisma.riskEvent.count({ where: { status: 'OPEN' } }),
      prisma.user.count({ where: { status: 'BANNED' } }),
      prisma.order.findMany({
        where: { createdAt: { gte: chartSince } },
        select: {
          amountCents: true,
          currency: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.playSession.findMany({
        where: { createdAt: { gte: chartSince } },
        select: { createdAt: true },
      }),
      prisma.riskEvent.findMany({
        where: { createdAt: { gte: chartSince } },
        select: { createdAt: true },
      }),
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          user: true,
          video: true,
        },
      }),
    ]);
    const dailyMetrics = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(chartSince);
      date.setDate(chartSince.getDate() + index);
      const key = date.toISOString().slice(0, 10);

      return {
        date: key,
        orders: 0,
        paidOrders: 0,
        starsRevenue: 0,
        creditRevenue: 0,
        playSessions: 0,
        riskEvents: 0,
      };
    });
    const metricByDate = new Map(dailyMetrics.map((item) => [item.date, item]));

    metricOrders.forEach((order) => {
      const item = metricByDate.get(order.createdAt.toISOString().slice(0, 10));

      if (!item) return;

      item.orders += 1;

      if (order.status === 'PAID') {
        item.paidOrders += 1;

        if (order.currency === 'XTR') {
          item.starsRevenue += order.amountCents;
        }

        if (order.currency === 'CREDITS') {
          item.creditRevenue += order.amountCents;
        }
      }
    });
    metricPlaySessions.forEach((session) => {
      const item = metricByDate.get(session.createdAt.toISOString().slice(0, 10));

      if (item) item.playSessions += 1;
    });
    metricRiskEvents.forEach((event) => {
      const item = metricByDate.get(event.createdAt.toISOString().slice(0, 10));

      if (item) item.riskEvents += 1;
    });

    return {
      stats: {
        userCount,
        seriesCount,
        videoCount,
        activeVideoCount,
        orderCount,
        paidOrderCount,
        activeEntitlementCount,
        playSessionCount,
        openRiskEventCount,
        bannedUserCount,
      },
      dailyMetrics,
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        orderCode: order.orderCode,
        status: order.status,
        amountCents: order.amountCents,
        currency: order.currency,
        createdAt: order.createdAt.toISOString(),
        user: {
          id: order.user.id,
          telegramUserId: order.user.telegramUserId.toString(),
          username: order.user.username,
        },
        video: {
          id: order.video.id,
          title: order.video.title,
        },
      })),
    };
  });

  app.get('/api/admin/settings', async (request) => {
    assertAdmin(request);

    const settings = await getRuntimeSettings();

    return {
      settings: {
        telegramBotToken: settingStatus(settings.telegramBotToken),
        telegramPaymentsEnabled: settingStatus(
          settings.telegramPaymentsEnabled ? 'true' : 'false',
          true,
        ),
        cloudflareAccountId: settingStatus(
          settings.cloudflareAccountId,
          true,
        ),
        cloudflareApiToken: settingStatus(settings.cloudflareApiToken),
        cloudflareCustomerSubdomain: settingStatus(
          settings.cloudflareCustomerSubdomain,
          true,
        ),
        cloudflareStreamSigningKeyId: settingStatus(
          settings.cloudflareStreamSigningKeyId,
          true,
        ),
        cloudflareStreamSigningPrivateKey: settingStatus(
          settings.cloudflareStreamSigningPrivateKey,
        ),
        demoCloudflareVideoUid: settingStatus(
          settings.demoCloudflareVideoUid,
          true,
        ),
        officialWatermarkText: settingStatus(
          settings.officialWatermarkText,
          true,
        ),
        maxConcurrentPlaySessions: settingStatus(
          String(settings.maxConcurrentPlaySessions),
          true,
        ),
      },
    };
  });

  app.put('/api/admin/settings', async (request) => {
    assertAdmin(request);

    const body = z
      .object({
        telegramBotToken: z.string().optional(),
        telegramPaymentsEnabled: z.string().optional(),
        cloudflareAccountId: z.string().optional(),
        cloudflareApiToken: z.string().optional(),
        cloudflareCustomerSubdomain: z.string().optional(),
        cloudflareStreamSigningKeyId: z.string().optional(),
        cloudflareStreamSigningPrivateKey: z.string().optional(),
        demoCloudflareVideoUid: z.string().optional(),
        officialWatermarkText: z.string().optional(),
        maxConcurrentPlaySessions: z.string().optional(),
      })
      .parse(request.body);

    const entries: Array<[string, string | undefined]> = [
      [settingKeys.telegramBotToken, body.telegramBotToken],
      [settingKeys.telegramPaymentsEnabled, body.telegramPaymentsEnabled],
      [settingKeys.cloudflareAccountId, body.cloudflareAccountId],
      [settingKeys.cloudflareApiToken, body.cloudflareApiToken],
      [settingKeys.cloudflareCustomerSubdomain, body.cloudflareCustomerSubdomain],
      [
        settingKeys.cloudflareStreamSigningKeyId,
        body.cloudflareStreamSigningKeyId,
      ],
      [
        settingKeys.cloudflareStreamSigningPrivateKey,
        body.cloudflareStreamSigningPrivateKey,
      ],
      [settingKeys.demoCloudflareVideoUid, body.demoCloudflareVideoUid],
      [settingKeys.officialWatermarkText, body.officialWatermarkText],
      [
        settingKeys.maxConcurrentPlaySessions,
        body.maxConcurrentPlaySessions,
      ],
    ];

    for (const [key, value] of entries) {
      if (typeof value === 'string' && value.trim()) {
        await upsertSetting(key, value.trim());
      }
    }

    await logActivity({
      actorType: 'admin',
      action: 'settings.update',
      entityType: 'settings',
      message: '后台配置已保存',
      request,
    });

    return { ok: true };
  });

  app.post('/api/admin/test/telegram', async (request) => {
    assertAdmin(request);

    const settings = await getRuntimeSettings();

    if (!settings.telegramBotToken) {
      throw new Error('Telegram Bot Token 未配置');
    }

    const bot = await telegramGetMe(settings.telegramBotToken);

    return {
      ok: true,
      bot,
    };
  });

  app.post('/api/admin/test/cloudflare', async (request) => {
    assertAdmin(request);

    await cloudflareFetch('/stream?per_page=1');

    return {
      ok: true,
    };
  });

  app.post('/api/admin/cloudflare/signing-key', async (request) => {
    assertAdmin(request);

    const key = await cloudflareFetch<{
      id: string;
      pem: string;
      created?: string;
    }>('/stream/keys', {
      method: 'POST',
    });
    const privateKey = decodeCloudflarePem(key.pem);

    await Promise.all([
      upsertSetting(settingKeys.cloudflareStreamSigningKeyId, key.id),
      upsertSetting(settingKeys.cloudflareStreamSigningPrivateKey, privateKey),
    ]);

    await logActivity({
      actorType: 'admin',
      action: 'cloudflare.signing_key.create',
      entityType: 'settings',
      message: '已生成 Cloudflare Stream Signing Key',
      metadata: {
        keyId: key.id,
        created: key.created,
      },
      request,
    });

    return {
      ok: true,
      key: {
        id: key.id,
        created: key.created || null,
      },
    };
  });

  app.post('/api/admin/cloudflare/direct-upload', async (request, reply) => {
    assertAdmin(request);

    const body = z
      .object({
        title: z.string().trim().min(1).max(191),
        maxDurationSeconds: z.coerce.number().int().positive().max(21600).default(3600),
        requireSignedURLs: z.coerce.boolean().default(true),
      })
      .parse(request.body);

    const upload = await cloudflareFetch<{
      uid: string;
      uploadURL: string;
    }>('/stream/direct_upload', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        maxDurationSeconds: body.maxDurationSeconds,
        requireSignedURLs: body.requireSignedURLs,
        meta: {
          name: body.title,
        },
      }),
    });

    await logActivity({
      actorType: 'admin',
      action: 'cloudflare.direct_upload.create',
      entityType: 'cloudflareVideo',
      message: `创建 Cloudflare 直传地址：${body.title}`,
      metadata: {
        uid: upload.uid,
        title: body.title,
        requireSignedURLs: body.requireSignedURLs,
      },
      request,
    });

    reply.code(201);

    return {
      upload: {
        uid: upload.uid,
        uploadURL: upload.uploadURL,
        title: body.title,
        requireSignedURLs: body.requireSignedURLs,
      },
    };
  });

  app.get('/api/admin/cloudflare/videos', async (request) => {
    assertAdmin(request);

    const videos = await cloudflareFetch<
      Array<{
        uid: string;
        thumbnail?: string;
        meta?: { name?: string };
        status?: { state?: string };
        duration?: number;
        created?: string;
      }>
    >('/stream?per_page=20');

    return {
      videos: videos.map((video) => ({
        uid: video.uid,
        name: video.meta?.name || video.uid,
        thumbnail: video.thumbnail,
        state: video.status?.state,
        duration: video.duration,
        created: video.created,
      })),
    };
  });

  app.post('/api/admin/videos/import', async (request, reply) => {
    assertAdmin(request);

    const body = z
      .object({
        cloudflareVideoUid: z.string().min(1),
        seriesId: z.coerce.number().int().positive().nullable().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        coverImageUrl: z.string().trim().max(500).optional(),
        priceCents: z.coerce.number().int().nonnegative().default(300),
        priceCredits: z.coerce.number().int().nonnegative().optional(),
        currency: z.string().min(1).default('XTR'),
      })
      .parse(request.body);
    const priceCredits = body.priceCredits ?? creditsFromStars(body.priceCents);

    const existing = await prisma.video.findFirst({
      where: {
        cloudflareVideoUid: body.cloudflareVideoUid,
      },
    });

    const video = existing
      ? await prisma.video.update({
          where: { id: existing.id },
          data: {
            seriesId: body.seriesId ?? null,
            title: body.title,
            description: body.description,
            coverImageUrl: body.coverImageUrl,
            priceCents: body.priceCents,
            priceCredits,
            currency: body.currency,
            status: 'ACTIVE',
          },
        })
      : await prisma.video.create({
          data: {
            seriesId: body.seriesId ?? null,
            title: body.title,
            description: body.description,
            coverImageUrl: body.coverImageUrl,
            cloudflareVideoUid: body.cloudflareVideoUid,
            priceCents: body.priceCents,
            priceCredits,
            currency: body.currency,
            status: 'ACTIVE',
          },
        });

    reply.code(existing ? 200 : 201);

    await logActivity({
      actorType: 'admin',
      action: existing ? 'video.import_update' : 'video.import_create',
      entityType: 'video',
      entityId: video.id,
      message: `导入视频：${video.title}`,
      metadata: { cloudflareVideoUid: video.cloudflareVideoUid },
      request,
    });

    return {
      video,
    };
  });

  app.post('/api/admin/videos/batch-import', async (request, reply) => {
    assertAdmin(request);

    const body = z
      .object({
        defaultSeriesTitle: z.string().trim().optional(),
        defaultSeriesSlug: z.string().trim().optional(),
        defaultPriceCents: z.coerce.number().int().nonnegative().default(300),
        videos: z
          .array(
            z.object({
              seriesTitle: z.string().trim().optional(),
              seriesSlug: z.string().trim().optional(),
              title: z.string().trim().min(1),
              description: z.string().trim().optional(),
              coverImageUrl: z.string().trim().max(500).optional(),
              cloudflareVideoUid: z.string().trim().min(1),
              priceCents: z.coerce.number().int().nonnegative().optional(),
              priceCredits: z.coerce.number().int().nonnegative().optional(),
              sortOrder: z.coerce.number().int().optional(),
              status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('ACTIVE'),
            }),
          )
          .min(1)
          .max(200),
      })
      .parse(request.body);

    const seriesCache = new Map<string, number | null>();
    const result = {
      created: 0,
      updated: 0,
      seriesCreated: 0,
      videos: [] as Array<{ id: number; title: string; action: 'created' | 'updated' }>,
    };

    for (const item of body.videos) {
      const seriesTitle = item.seriesTitle || body.defaultSeriesTitle;
      const seriesSlugInput = item.seriesSlug || body.defaultSeriesSlug || seriesTitle;
      const seriesKey = seriesSlugInput ? slugify(seriesSlugInput) : '';
      let seriesId: number | null = null;

      if (seriesTitle && seriesKey) {
        if (seriesCache.has(seriesKey)) {
          seriesId = seriesCache.get(seriesKey) ?? null;
        } else {
          const existingSeries = await prisma.series.findFirst({
            where: {
              OR: [{ slug: seriesKey }, { title: seriesTitle }],
            },
          });
          const series =
            existingSeries ||
            (await prisma.series.create({
              data: {
                title: seriesTitle,
                slug: await uniqueSeriesSlug(seriesSlugInput || seriesTitle),
                status: 'ACTIVE',
              },
            }));

          if (!existingSeries) {
            result.seriesCreated += 1;
          }

          seriesId = series.id;
          seriesCache.set(seriesKey, seriesId);
        }
      }

      const priceCents = item.priceCents ?? body.defaultPriceCents;
      const priceCredits = item.priceCredits ?? creditsFromStars(priceCents);
      const existingVideo = await prisma.video.findFirst({
        where: {
          cloudflareVideoUid: item.cloudflareVideoUid,
        },
      });
      const video = existingVideo
        ? await prisma.video.update({
            where: { id: existingVideo.id },
            data: {
              seriesId,
              title: item.title,
              description: item.description,
              coverImageUrl: item.coverImageUrl,
              priceCents,
              priceCredits,
              currency: 'XTR',
              sortOrder: item.sortOrder ?? existingVideo.sortOrder,
              status: item.status,
            },
          })
        : await prisma.video.create({
            data: {
              seriesId,
              title: item.title,
              description: item.description,
              coverImageUrl: item.coverImageUrl,
              cloudflareVideoUid: item.cloudflareVideoUid,
              priceCents,
              priceCredits,
              currency: 'XTR',
              sortOrder: item.sortOrder ?? 0,
              status: item.status,
            },
          });

      const action = existingVideo ? 'updated' : 'created';
      result[action] += 1;
      result.videos.push({ id: video.id, title: video.title, action });
    }

    await logActivity({
      actorType: 'admin',
      action: 'video.batch_import',
      entityType: 'video',
      message: `批量导入视频：新增 ${result.created}，更新 ${result.updated}`,
      metadata: result,
      request,
    });

    reply.code(201);

    return result;
  });

  app.get('/api/admin/series', async (request) => {
    assertAdmin(request);
    const query = listQuerySchema.parse(request.query);
    const where: Prisma.SeriesWhereInput = {};

    if (query.status) {
      where.status = query.status as never;
    }

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [{ title: { contains: q } }, { slug: { contains: q } }];
    }

    const series = await prisma.series.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        _count: {
          select: {
            videos: true,
          },
        },
      },
    });

    return {
      series: series.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        slug: item.slug,
        status: item.status,
        sortOrder: item.sortOrder,
        createdAt: item.createdAt.toISOString(),
        counts: item._count,
      })),
    };
  });

  app.post('/api/admin/series', async (request, reply) => {
    assertAdmin(request);

    const body = seriesBodySchema.parse(request.body);
    const series = await prisma.series.create({
      data: {
        ...body,
        slug: await uniqueSeriesSlug(body.slug || body.title),
      },
    });

    reply.code(201);

    await logActivity({
      actorType: 'admin',
      action: 'series.create',
      entityType: 'series',
      entityId: series.id,
      message: `新建系列：${series.title}`,
      request,
    });

    return { series };
  });

  app.put('/api/admin/series/:id', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const body = seriesBodySchema.partial().parse(request.body);
    const series = await prisma.series.update({
      where: { id },
      data: {
        ...body,
        ...(body.slug || body.title
          ? { slug: await uniqueSeriesSlug(body.slug || body.title || '', id) }
          : {}),
      },
    });

    await logActivity({
      actorType: 'admin',
      action: 'series.update',
      entityType: 'series',
      entityId: series.id,
      message: `更新系列：${series.title}`,
      metadata: body,
      request,
    });

    return { series };
  });

  app.delete('/api/admin/series/:id', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const series = await prisma.series.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    await logActivity({
      actorType: 'admin',
      action: 'series.archive',
      entityType: 'series',
      entityId: series.id,
      message: `归档系列：${series.title}`,
      request,
    });

    return { series };
  });

  app.get('/api/admin/videos', async (request) => {
    assertAdmin(request);
    const query = listQuerySchema.parse(request.query);
    const where: Prisma.VideoWhereInput = {};

    if (query.status) {
      where.status = query.status as never;
    }

    if (query.seriesId) {
      const seriesId = Number(query.seriesId);

      if (Number.isInteger(seriesId) && seriesId > 0) {
        where.seriesId = seriesId;
      }
    }

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { title: { contains: q } },
        { cloudflareVideoUid: { contains: q } },
        { series: { title: { contains: q } } },
      ];
    }

    const videos = await prisma.video.findMany({
      where,
      orderBy: [{ seriesId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        series: true,
        _count: {
          select: {
            orders: true,
            entitlements: true,
            playSessions: true,
          },
        },
      },
    });

    return {
      videos: videos.map((video) => ({
        id: video.id,
        seriesId: video.seriesId,
        title: video.title,
        description: video.description,
        coverImageUrl: video.coverImageUrl,
        cloudflareVideoUid: video.cloudflareVideoUid,
        priceCents: video.priceCents,
        priceCredits: video.priceCredits,
        currency: video.currency,
        status: video.status,
        sortOrder: video.sortOrder,
        series: video.series
          ? {
              id: video.series.id,
              title: video.series.title,
              slug: video.series.slug,
            }
          : null,
        createdAt: video.createdAt.toISOString(),
        counts: video._count,
      })),
    };
  });

  app.post('/api/admin/videos', async (request, reply) => {
    assertAdmin(request);

    const body = videoBodySchema.parse(request.body);
    const video = await prisma.video.create({
      data: {
        ...body,
        priceCredits: body.priceCredits ?? creditsFromStars(body.priceCents),
      },
    });

    reply.code(201);

    await logActivity({
      actorType: 'admin',
      action: 'video.create',
      entityType: 'video',
      entityId: video.id,
      message: `新建视频：${video.title}`,
      request,
    });

    return { video };
  });

  app.put('/api/admin/videos/:id', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const body = videoBodySchema.partial().parse(request.body);
    const data = {
      ...body,
      priceCredits:
        body.priceCredits ?? (body.priceCents !== undefined ? creditsFromStars(body.priceCents) : undefined),
    };
    const video = await prisma.video.update({
      where: { id },
      data,
    });

    await logActivity({
      actorType: 'admin',
      action: 'video.update',
      entityType: 'video',
      entityId: video.id,
      message: `更新视频：${video.title}`,
      metadata: data,
      request,
    });

    return { video };
  });

  app.delete('/api/admin/videos/:id', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const video = await prisma.video.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    await logActivity({
      actorType: 'admin',
      action: 'video.archive',
      entityType: 'video',
      entityId: video.id,
      message: `归档视频：${video.title}`,
      request,
    });

    return { video };
  });

  app.get('/api/admin/orders', async (request) => {
    assertAdmin(request);
    const query = listQuerySchema.parse(request.query);
    const where: Prisma.OrderWhereInput = {};

    if (query.status) {
      where.status = query.status as never;
    }

    if (query.provider) {
      where.provider = query.provider;
    }

    if (query.q?.trim()) {
      const q = query.q.trim();
      const usernameNormalized = normalizeTelegramUsername(q);
      where.OR = [
        { orderCode: { contains: q } },
        { providerPaymentId: { contains: q } },
        { user: { username: { contains: q } } },
        ...(usernameNormalized
          ? [{ user: { usernameNormalized: { contains: usernameNormalized } } }]
          : []),
        { video: { title: { contains: q } } },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: true,
        video: true,
        entitlement: true,
      },
    });

    return {
      orders: orders.map((order) => ({
        id: order.id,
        orderCode: order.orderCode,
        amountCents: order.amountCents,
        currency: order.currency,
        status: order.status,
        provider: order.provider,
        paidAt: order.paidAt?.toISOString() || null,
        createdAt: order.createdAt.toISOString(),
        user: {
          id: order.user.id,
          telegramUserId: order.user.telegramUserId.toString(),
          username: order.user.username,
          firstName: order.user.firstName,
        },
        video: {
          id: order.video.id,
          title: order.video.title,
        },
        entitlement: order.entitlement
          ? {
              id: order.entitlement.id,
              status: order.entitlement.status,
              expiresAt: order.entitlement.expiresAt?.toISOString() || null,
              revokedAt: order.entitlement.revokedAt?.toISOString() || null,
            }
          : null,
      })),
    };
  });

  app.get('/api/admin/orders/:id', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const order = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: {
        user: true,
        video: true,
        entitlement: true,
        playSessions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            _count: {
              select: {
                events: true,
              },
            },
          },
        },
      },
    });

    return {
      order: {
        id: order.id,
        orderCode: order.orderCode,
        amountCents: order.amountCents,
        currency: order.currency,
        status: order.status,
        provider: order.provider,
        providerPaymentId: order.providerPaymentId,
        paidAt: order.paidAt?.toISOString() || null,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        user: serializeUser(order.user),
        video: {
          id: order.video.id,
          title: order.video.title,
          cloudflareVideoUid: order.video.cloudflareVideoUid,
          priceCents: order.video.priceCents,
          priceCredits: order.video.priceCredits,
          currency: order.video.currency,
          status: order.video.status,
        },
        entitlement: order.entitlement
          ? {
              id: order.entitlement.id,
              status: order.entitlement.status,
              startsAt: order.entitlement.startsAt.toISOString(),
              expiresAt: order.entitlement.expiresAt?.toISOString() || null,
              revokedAt: order.entitlement.revokedAt?.toISOString() || null,
              createdAt: order.entitlement.createdAt.toISOString(),
            }
          : null,
        playSessions: order.playSessions.map((session) => ({
          id: session.id,
          sessionCode: session.sessionCode,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          tokenExpiresAt: session.tokenExpiresAt.toISOString(),
          createdAt: session.createdAt.toISOString(),
          lastSeenAt: session.lastSeenAt?.toISOString() || null,
          eventCount: session._count.events,
        })),
      },
    };
  });

  app.post('/api/admin/orders/:id/grant', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const order = await prisma.order.findUniqueOrThrow({ where: { id } });

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      await tx.entitlement.upsert({
        where: { orderId: id },
        update: {
          status: 'ACTIVE',
          revokedAt: null,
        },
        create: {
          userId: order.userId,
          videoId: order.videoId,
          orderId: order.id,
          status: 'ACTIVE',
        },
      });
    });

    await logActivity({
      actorType: 'admin',
      action: 'order.mark_paid',
      entityType: 'order',
      entityId: order.id,
      message: `标记订单已支付：${order.orderCode}`,
      request,
    });

    return { ok: true };
  });

  app.post('/api/admin/entitlements/:id/revoke', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const entitlement = await prisma.entitlement.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    await logActivity({
      actorType: 'admin',
      action: 'entitlement.revoke',
      entityType: 'entitlement',
      entityId: entitlement.id,
      message: `撤销权限：${entitlement.id}`,
      metadata: { orderId: entitlement.orderId },
      request,
    });

    return { entitlement };
  });

  app.post('/api/admin/entitlements/:id/restore', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const entitlement = await prisma.entitlement.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        revokedAt: null,
      },
    });

    await logActivity({
      actorType: 'admin',
      action: 'entitlement.restore',
      entityType: 'entitlement',
      entityId: entitlement.id,
      message: `恢复权限：${entitlement.id}`,
      metadata: { orderId: entitlement.orderId },
      request,
    });

    return { entitlement };
  });

  app.get('/api/admin/users', async (request) => {
    assertAdmin(request);
    const query = listQuerySchema.parse(request.query);
    const where: Prisma.UserWhereInput = {};

    if (query.q?.trim()) {
      const q = query.q.trim();
      const usernameNormalized = normalizeTelegramUsername(q);
      const asBigInt = /^\d+$/.test(q) ? BigInt(q) : undefined;
      where.OR = [
        { username: { contains: q } },
        ...(usernameNormalized ? [{ usernameNormalized: { contains: usernameNormalized } }] : []),
        { firstName: { contains: q } },
        ...(asBigInt ? [{ telegramUserId: asBigInt }] : []),
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: [{ status: 'desc' }, { riskScore: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        _count: {
          select: {
            orders: true,
            entitlements: true,
            playSessions: true,
          },
        },
      },
    });

    return {
      users: users.map((user) => ({
        ...serializeUser(user),
        counts: user._count,
      })),
    };
  });

  app.post('/api/admin/users/:id/ban', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const body = z
      .object({
        reason: z.string().trim().max(255).default('违反平台规则'),
      })
      .parse(request.body || {});
    const user = await prisma.user.update({
      where: { id },
      data: {
        status: 'BANNED',
        bannedAt: new Date(),
        banReason: body.reason,
        riskScore: {
          increment: 10,
        },
      },
    });

    await prisma.riskEvent.create({
      data: {
        userId: user.id,
        type: 'user_banned',
        severity: 5,
        status: 'RESOLVED',
        message: `后台封禁用户：${body.reason}`,
        resolvedAt: new Date(),
      },
    });

    await logActivity({
      actorType: 'admin',
      action: 'user.ban',
      entityType: 'user',
      entityId: user.id,
      message: `封禁用户：${user.telegramUserId.toString()}`,
      metadata: { reason: body.reason },
      request,
    });

    return { user: serializeUser(user) };
  });

  app.post('/api/admin/users/:id/unban', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const user = await prisma.user.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        bannedAt: null,
        banReason: null,
      },
    });

    await logActivity({
      actorType: 'admin',
      action: 'user.unban',
      entityType: 'user',
      entityId: user.id,
      message: `解除封禁：${user.telegramUserId.toString()}`,
      request,
    });

    return { user: serializeUser(user) };
  });

  app.get('/api/admin/users/:id', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            video: true,
            entitlement: true,
          },
        },
        entitlements: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            video: true,
            order: true,
          },
        },
        playSessions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            video: true,
            order: true,
            _count: {
              select: { events: true },
            },
          },
        },
        creditTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            order: true,
            video: true,
          },
        },
      },
    });

    return {
      user: {
        ...serializeUser(user),
        orders: user.orders.map((order) => ({
          id: order.id,
          orderCode: order.orderCode,
          status: order.status,
          provider: order.provider,
          amountCents: order.amountCents,
          currency: order.currency,
          paidAt: order.paidAt?.toISOString() || null,
          createdAt: order.createdAt.toISOString(),
          video: {
            id: order.video.id,
            title: order.video.title,
          },
          entitlement: order.entitlement
            ? {
                id: order.entitlement.id,
                status: order.entitlement.status,
              }
            : null,
        })),
        entitlements: user.entitlements.map((entitlement) => ({
          id: entitlement.id,
          status: entitlement.status,
          startsAt: entitlement.startsAt.toISOString(),
          expiresAt: entitlement.expiresAt?.toISOString() || null,
          revokedAt: entitlement.revokedAt?.toISOString() || null,
          video: {
            id: entitlement.video.id,
            title: entitlement.video.title,
          },
          order: {
            id: entitlement.order.id,
            orderCode: entitlement.order.orderCode,
          },
        })),
        playSessions: user.playSessions.map((session) => ({
          id: session.id,
          sessionCode: session.sessionCode,
          ipAddress: session.ipAddress,
          createdAt: session.createdAt.toISOString(),
          lastSeenAt: session.lastSeenAt?.toISOString() || null,
          eventCount: session._count.events,
          video: {
            id: session.video.id,
            title: session.video.title,
          },
          order: {
            id: session.order.id,
            orderCode: session.order.orderCode,
          },
        })),
        creditTransactions: user.creditTransactions.map((transaction) => ({
          id: transaction.id,
          type: transaction.type,
          amount: transaction.amount,
          balanceAfter: transaction.balanceAfter,
          note: transaction.note,
          createdAt: transaction.createdAt.toISOString(),
          order: transaction.order
            ? {
                id: transaction.order.id,
                orderCode: transaction.order.orderCode,
              }
            : null,
          video: transaction.video
            ? {
                id: transaction.video.id,
                title: transaction.video.title,
              }
            : null,
        })),
      },
    };
  });

  app.get('/api/admin/play-sessions', async (request) => {
    assertAdmin(request);
    const query = listQuerySchema.parse(request.query);
    const where: Prisma.PlaySessionWhereInput = {};

    if (query.q?.trim()) {
      const q = query.q.trim();
      const usernameNormalized = normalizeTelegramUsername(q);
      where.OR = [
        { sessionCode: { contains: q } },
        { ipAddress: { contains: q } },
        { user: { username: { contains: q } } },
        ...(usernameNormalized
          ? [{ user: { usernameNormalized: { contains: usernameNormalized } } }]
          : []),
        { video: { title: { contains: q } } },
        { order: { orderCode: { contains: q } } },
      ];
    }

    const sessions = await prisma.playSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: true,
        video: true,
        order: true,
        _count: {
          select: {
            events: true,
          },
        },
      },
    });

    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        sessionCode: session.sessionCode,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        tokenExpiresAt: session.tokenExpiresAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt?.toISOString() || null,
        eventCount: session._count.events,
        user: {
          id: session.user.id,
          telegramUserId: session.user.telegramUserId.toString(),
          username: session.user.username,
        },
        video: {
          id: session.video.id,
          title: session.video.title,
        },
        order: {
          id: session.order.id,
          orderCode: session.order.orderCode,
        },
      })),
    };
  });

  app.get('/api/admin/play-sessions/:id', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const session = await prisma.playSession.findUniqueOrThrow({
      where: { id },
      include: {
        user: true,
        video: true,
        order: true,
        events: {
          orderBy: { createdAt: 'desc' },
          take: 200,
        },
      },
    });

    return {
      session: {
        id: session.id,
        sessionCode: session.sessionCode,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        tokenExpiresAt: session.tokenExpiresAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt?.toISOString() || null,
        user: {
          id: session.user.id,
          telegramUserId: session.user.telegramUserId.toString(),
          username: session.user.username,
        },
        video: {
          id: session.video.id,
          title: session.video.title,
        },
        order: {
          id: session.order.id,
          orderCode: session.order.orderCode,
        },
        events: session.events.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          playbackPositionSeconds: event.playbackPositionSeconds,
          createdAt: event.createdAt.toISOString(),
        })),
      },
    };
  });

  app.get('/api/admin/play-sessions/:id/events', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const events = await prisma.playEvent.findMany({
      where: { playSessionId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return {
      events: events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        playbackPositionSeconds: event.playbackPositionSeconds,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  });

  app.post('/api/admin/grants', async (request, reply) => {
    assertAdmin(request);

    const body = z
      .object({
        telegramUserId: z.coerce.bigint(),
        videoId: z.coerce.number().int().positive(),
        username: z.string().optional(),
      })
      .parse(request.body);

    const video = await prisma.video.findUniqueOrThrow({
      where: { id: body.videoId },
    });
    const orderCode = `ADM${Date.now().toString(36).toUpperCase()}`;
    const username = cleanTelegramUsername(body.username);
    const usernameNormalized = normalizeTelegramUsername(body.username);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { telegramUserId: body.telegramUserId },
        update: {
          username,
          usernameNormalized,
        },
        create: {
          telegramUserId: body.telegramUserId,
          username,
          usernameNormalized,
        },
      });

      const order = await tx.order.create({
        data: {
          orderCode,
          userId: user.id,
          videoId: video.id,
          amountCents: 0,
          currency: video.currency,
          status: 'PAID',
          provider: 'admin',
          paidAt: new Date(),
        },
      });

      const entitlement = await tx.entitlement.create({
        data: {
          userId: user.id,
          videoId: video.id,
          orderId: order.id,
          status: 'ACTIVE',
        },
      });

      return { user, order, entitlement };
    });

    reply.code(201);

    await logActivity({
      actorType: 'admin',
      action: 'grant.manual',
      entityType: 'order',
      entityId: result.order.id,
      message: `手动发放权限：${result.order.orderCode}`,
      metadata: {
        telegramUserId: body.telegramUserId.toString(),
        videoId: video.id,
      },
      request,
    });

    return {
      order: {
        id: result.order.id,
        orderCode: result.order.orderCode,
      },
      entitlement: result.entitlement,
    };
  });

  app.post('/api/admin/credits/adjust', async (request, reply) => {
    assertAdmin(request);

    const body = z
      .object({
        telegramUserId: z.coerce.bigint(),
        amount: z.coerce.number().int(),
        username: z.string().optional(),
        note: z.string().optional(),
      })
      .parse(request.body);

    if (body.amount === 0) {
      throw new Error('积分调整数量不能为 0');
    }

    const username = cleanTelegramUsername(body.username);
    const usernameNormalized = normalizeTelegramUsername(body.username);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { telegramUserId: body.telegramUserId },
        update: {
          ...(username ? { username, usernameNormalized } : {}),
        },
        create: {
          telegramUserId: body.telegramUserId,
          username,
          usernameNormalized,
        },
      });
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          creditBalance: {
            increment: body.amount,
          },
        },
      });

      if (updatedUser.creditBalance < 0) {
        throw new Error('调整后积分不能为负数');
      }

      const transaction = await tx.creditTransaction.create({
        data: {
          userId: updatedUser.id,
          amount: body.amount,
          balanceAfter: updatedUser.creditBalance,
          type: 'admin_adjust',
          note: body.note || '后台调整积分',
        },
      });

      return { user: updatedUser, transaction };
    });

    await logActivity({
      actorType: 'admin',
      action: 'credits.adjust',
      entityType: 'user',
      entityId: result.user.id,
      message: `调整积分：${body.amount > 0 ? '+' : ''}${body.amount}`,
      metadata: {
        telegramUserId: body.telegramUserId.toString(),
        balanceAfter: result.user.creditBalance,
      },
      request,
    });

    reply.code(201);

    return {
      user: serializeUser(result.user),
      transaction: result.transaction,
    };
  });

  app.get('/api/admin/external-recharges', async (request) => {
    assertAdmin(request);
    const query = listQuerySchema.parse(request.query);
    const where: Prisma.ExternalCreditRechargeWhereInput = {};

    if (query.q?.trim()) {
      const q = query.q.trim();
      const usernameNormalized = normalizeTelegramUsername(q);
      where.OR = [
        { requestId: { contains: q } },
        { provider: { contains: q } },
        { externalPaymentId: { contains: q } },
        { user: { username: { contains: q } } },
        ...(usernameNormalized
          ? [{ user: { usernameNormalized: { contains: usernameNormalized } } }]
          : []),
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    const recharges = await prisma.externalCreditRecharge.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: true },
    });

    return {
      recharges: recharges.map((recharge) => ({
        id: recharge.id,
        requestId: recharge.requestId,
        provider: recharge.provider,
        externalPaymentId: recharge.externalPaymentId,
        amount: recharge.amount,
        status: recharge.status,
        note: recharge.note,
        creditedAt: recharge.creditedAt?.toISOString() || null,
        createdAt: recharge.createdAt.toISOString(),
        user: serializeUser(recharge.user),
      })),
    };
  });

  app.get('/api/admin/risk/events', async (request) => {
    assertAdmin(request);
    const query = listQuerySchema.parse(request.query);
    const where: Prisma.RiskEventWhereInput = {};

    if (query.q?.trim()) {
      const q = query.q.trim();
      const usernameNormalized = normalizeTelegramUsername(q);
      where.OR = [
        { type: { contains: q } },
        { message: { contains: q } },
        { user: { username: { contains: q } } },
        ...(usernameNormalized
          ? [{ user: { usernameNormalized: { contains: usernameNormalized } } }]
          : []),
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    const events = await prisma.riskEvent.findMany({
      where,
      orderBy: [{ status: 'asc' }, { severity: 'desc' }, { createdAt: 'desc' }],
      take: 150,
      include: {
        user: true,
        playSession: {
          include: {
            video: true,
            order: true,
          },
        },
      },
    });

    return {
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        severity: event.severity,
        status: event.status,
        message: event.message,
        metadata: event.metadata,
        createdAt: event.createdAt.toISOString(),
        resolvedAt: event.resolvedAt?.toISOString() || null,
        user: event.user ? serializeUser(event.user) : null,
        playSession: event.playSession
          ? {
              id: event.playSession.id,
              sessionCode: event.playSession.sessionCode,
              ipAddress: event.playSession.ipAddress,
              video: {
                id: event.playSession.video.id,
                title: event.playSession.video.title,
              },
              order: {
                id: event.playSession.order.id,
                orderCode: event.playSession.order.orderCode,
              },
            }
          : null,
      })),
    };
  });

  app.post('/api/admin/risk/events/:id/resolve', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const event = await prisma.riskEvent.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
    });

    await logActivity({
      actorType: 'admin',
      action: 'risk.resolve',
      entityType: 'riskEvent',
      entityId: event.id,
      message: `处理风控事件：${event.type}`,
      request,
    });

    return { event };
  });

  app.post('/api/admin/risk/scan-playback', async (request, reply) => {
    assertAdmin(request);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const users = await prisma.user.findMany({
      where: {
        playSessions: {
          some: {
            createdAt: { gte: since },
          },
        },
      },
      include: {
        playSessions: {
          where: {
            createdAt: { gte: since },
          },
          include: {
            _count: { select: { events: true } },
          },
        },
      },
      take: 200,
    });
    let created = 0;

    for (const user of users) {
      const sessionCount = user.playSessions.length;
      const ipCount = new Set(user.playSessions.map((session) => session.ipAddress).filter(Boolean)).size;
      const noisySession = user.playSessions.find((session) => session._count.events >= 120);

      if (sessionCount >= 8 || ipCount >= 4 || noisySession) {
        await prisma.riskEvent.create({
          data: {
            userId: user.id,
            playSessionId: noisySession?.id,
            type: 'playback_anomaly',
            severity: noisySession ? 3 : 2,
            message: '播放行为异常，需要人工复核',
            metadata: JSON.stringify({
              sessionCount,
              ipCount,
              noisySessionCode: noisySession?.sessionCode,
              eventCount: noisySession?._count.events,
            }),
          },
        });
        await prisma.user.update({
          where: { id: user.id },
          data: { riskScore: { increment: noisySession ? 3 : 2 } },
        });
        created += 1;
      }
    }

    await logActivity({
      actorType: 'admin',
      action: 'risk.scan_playback',
      entityType: 'riskEvent',
      message: `播放异常扫描：新增 ${created} 个事件`,
      request,
    });

    reply.code(201);

    return { created };
  });

  app.get('/api/admin/policies', async (request) => {
    assertAdmin(request);
    const policies = await prisma.policyDocument.findMany({
      orderBy: { id: 'asc' },
    });

    return {
      policies: policies.map((policy) => ({
        id: policy.id,
        slug: policy.slug,
        title: policy.title,
        content: policy.content,
        status: policy.status,
        updatedAt: policy.updatedAt.toISOString(),
      })),
    };
  });

  app.put('/api/admin/policies/:slug', async (request) => {
    assertAdmin(request);
    const { slug } = z.object({ slug: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        title: z.string().trim().min(1),
        content: z.string().trim().min(1),
        status: z.enum(['PUBLISHED', 'DRAFT']).default('PUBLISHED'),
      })
      .parse(request.body);
    const policy = await prisma.policyDocument.upsert({
      where: { slug },
      update: body,
      create: {
        slug,
        ...body,
      },
    });

    await logActivity({
      actorType: 'admin',
      action: 'policy.update',
      entityType: 'policyDocument',
      entityId: policy.id,
      message: `更新政策文档：${policy.title}`,
      request,
    });

    return { policy };
  });

  app.get('/api/admin/activity-logs', async (request) => {
    assertAdmin(request);
    const query = listQuerySchema.parse(request.query);
    const where: Prisma.ActivityLogWhereInput = {};

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { action: { contains: q } },
        { entityType: { contains: q } },
        { message: { contains: q } },
        { actorId: { contains: q } },
      ];
    }

    const logs = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return {
      logs: logs.map((log) => ({
        id: log.id,
        actorType: log.actorType,
        actorId: log.actorId,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        message: log.message,
        metadata: log.metadata,
        ipAddress: log.ipAddress,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  });

  app.post('/api/admin/dev/test-user', async (request, reply) => {
    assertAdmin(request);

    const body = z
      .object({
        telegramUserId: z.coerce.bigint().optional(),
        username: z.string().optional(),
      })
      .parse(request.body);
    const telegramUserId = body.telegramUserId || BigInt(Date.now());
    const username = cleanTelegramUsername(
      body.username || `test_${telegramUserId.toString().slice(-6)}`,
    );
    const usernameNormalized = normalizeTelegramUsername(username);

    const user = await prisma.user.upsert({
      where: { telegramUserId },
      update: {
        username,
        usernameNormalized,
      },
      create: {
        telegramUserId,
        username,
        usernameNormalized,
        firstName: 'Test',
        lastName: 'User',
        languageCode: 'zh',
      },
    });

    await logActivity({
      actorType: 'admin',
      action: 'dev.test_user',
      entityType: 'user',
      entityId: user.id,
      message: `创建测试用户：${user.telegramUserId.toString()}`,
      request,
    });

    reply.code(201);

    return {
      user: serializeUser(user),
    };
  });

  app.post('/api/admin/dev/test-order', async (request, reply) => {
    assertAdmin(request);

    const body = z
      .object({
        telegramUserId: z.coerce.bigint(),
        videoId: z.coerce.number().int().positive(),
        provider: z.string().default('telegram_stars'),
        paid: z.coerce.boolean().default(false),
      })
      .parse(request.body);
    const video = await prisma.video.findUniqueOrThrow({
      where: { id: body.videoId },
    });

    const result = await prisma.$transaction(async (tx) => {
      const username = `test_${body.telegramUserId.toString().slice(-6)}`;
      const user = await tx.user.upsert({
        where: { telegramUserId: body.telegramUserId },
        update: {},
        create: {
          telegramUserId: body.telegramUserId,
          username,
          usernameNormalized: normalizeTelegramUsername(username),
          firstName: 'Test',
          lastName: 'Buyer',
          languageCode: 'zh',
        },
      });
      const order = await tx.order.create({
        data: {
          orderCode: `DEV${Date.now().toString(36).toUpperCase()}`,
          userId: user.id,
          videoId: video.id,
          amountCents: video.priceCents,
          currency: video.currency,
          status: body.paid ? 'PAID' : 'PENDING',
          provider: body.provider,
          paidAt: body.paid ? new Date() : null,
        },
      });
      const entitlement = body.paid
        ? await tx.entitlement.create({
            data: {
              userId: user.id,
              videoId: video.id,
              orderId: order.id,
              status: 'ACTIVE',
            },
          })
        : null;

      return { user, order, entitlement };
    });

    await logActivity({
      actorType: 'admin',
      action: 'dev.test_order',
      entityType: 'order',
      entityId: result.order.id,
      message: `创建测试订单：${result.order.orderCode}`,
      metadata: {
        paid: body.paid,
        provider: body.provider,
      },
      request,
    });

    reply.code(201);

    return {
      order: {
        id: result.order.id,
        orderCode: result.order.orderCode,
        status: result.order.status,
      },
    };
  });

  app.post('/api/admin/dev/simulate-telegram-payment', async (request) => {
    assertAdmin(request);

    const body = z
      .object({
        orderCode: z.string().min(1),
      })
      .parse(request.body);
    const order = await prisma.order.findUniqueOrThrow({
      where: { orderCode: body.orderCode },
    });

    await markOrderPaidFromTelegram(order.orderCode, {
      currency: order.currency,
      total_amount: order.amountCents,
      telegram_payment_charge_id: `dev_tg_${order.orderCode}`,
      provider_payment_charge_id: `dev_provider_${order.orderCode}`,
    });

    await logActivity({
      actorType: 'admin',
      action: 'dev.simulate_telegram_payment',
      entityType: 'order',
      entityId: order.id,
      message: `模拟 Telegram 支付回调：${order.orderCode}`,
      request,
    });

    return {
      ok: true,
      order: {
        id: order.id,
        orderCode: order.orderCode,
        status: 'PAID',
      },
    };
  });

  app.post('/api/admin/dev/clear-play-sessions', async (request) => {
    assertAdmin(request);

    const deletedEvents = await prisma.playEvent.deleteMany();
    const deletedSessions = await prisma.playSession.deleteMany();

    await logActivity({
      actorType: 'admin',
      action: 'dev.clear_play_sessions',
      entityType: 'playSession',
      message: '清理播放 session',
      metadata: {
        deletedEvents: deletedEvents.count,
        deletedSessions: deletedSessions.count,
      },
      request,
    });

    return {
      ok: true,
      deletedEvents: deletedEvents.count,
      deletedSessions: deletedSessions.count,
    };
  });
}
