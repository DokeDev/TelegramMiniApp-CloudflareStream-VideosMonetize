import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { logActivity } from './activity.js';
import { getCurrentUser, publicUser } from './auth.js';
import { makeCode } from './codes.js';
import { config, isDevelopment } from './config.js';
import { createPlaybackUrl } from './cloudflare.js';
import { prisma } from './db.js';
import {
  createCreditRechargeInvoiceLink,
  createTelegramInvoiceLink,
  handleTelegramPaymentUpdate,
  starsAmountForVideo,
} from './payments.js';
import { getRuntimeSettings } from './settings.js';
import { cleanTelegramUsername, normalizeTelegramUsername } from './username.js';

const idParams = z.object({
  id: z.coerce.number().int().positive(),
});

function assertExternalRechargeSecret(request: FastifyRequest) {
  const providedSecret = request.headers['x-external-recharge-secret']?.toString();

  if (!config.EXTERNAL_RECHARGE_SECRET || providedSecret !== config.EXTERNAL_RECHARGE_SECRET) {
    const error = new Error('Invalid external recharge secret');
    Object.assign(error, { statusCode: 401 });
    throw error;
  }
}

function serializeExternalRechargeUser(user: {
  id: number;
  telegramUserId: bigint;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string;
  creditBalance: number;
  updatedAt: Date;
}) {
  const displayName =
    user.username ||
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    `TG-${user.telegramUserId.toString().slice(-6)}`;

  return {
    id: user.id,
    telegramUserId: user.telegramUserId.toString(),
    telegramUserIdTail: user.telegramUserId.toString().slice(-4),
    username: user.username,
    displayName,
    status: user.status,
    creditBalance: user.creditBalance,
    updatedAt: user.updatedAt.toISOString(),
  };
}

async function createRiskEvent(input: {
  userId?: number;
  playSessionId?: number;
  type: string;
  severity: number;
  message: string;
  metadata?: unknown;
}) {
  await prisma.riskEvent.create({
    data: {
      userId: input.userId,
      playSessionId: input.playSessionId,
      type: input.type,
      severity: input.severity,
      message: input.message,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    },
  });

  if (input.userId) {
    await prisma.user
      .update({
        where: { id: input.userId },
        data: {
          riskScore: {
            increment: input.severity,
          },
        },
      })
      .catch(() => undefined);
  }
}

export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    ok: true,
    service: 'tg-video-sales-api',
  }));

  app.get('/ready', async () => {
    await prisma.$queryRaw`SELECT 1`;

    return {
      ok: true,
      service: 'tg-video-sales-api',
      database: 'ok',
    };
  });

  app.post('/api/auth/telegram', async (request) => {
    const user = await getCurrentUser(request);

    return {
      user: publicUser(user),
    };
  });

  app.get('/api/policies', async () => {
    const policies = await prisma.policyDocument.findMany({
      where: {
        status: 'PUBLISHED',
      },
      orderBy: { id: 'asc' },
    });

    return {
      policies: policies.map((policy) => ({
        slug: policy.slug,
        title: policy.title,
        updatedAt: policy.updatedAt.toISOString(),
      })),
    };
  });

  app.get('/api/policies/:slug', async (request) => {
    const { slug } = z
      .object({
        slug: z.string().min(1),
      })
      .parse(request.params);

    const policy = await prisma.policyDocument.findFirstOrThrow({
      where: {
        slug,
        status: 'PUBLISHED',
      },
    });

    return {
      policy: {
        slug: policy.slug,
        title: policy.title,
        content: policy.content,
        updatedAt: policy.updatedAt.toISOString(),
      },
    };
  });

  app.post('/api/external/users/lookup', async (request) => {
    assertExternalRechargeSecret(request);

    const body = z
      .object({
        username: z.string().trim().min(1).max(191),
      })
      .parse(request.body);

    const usernameNormalized = normalizeTelegramUsername(body.username);

    if (!usernameNormalized) {
      const error = new Error('请输入 Telegram 用户名');
      Object.assign(error, { statusCode: 400 });
      throw error;
    }

    const user = await prisma.user.findFirst({
      where: {
        usernameNormalized,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (!user) {
      const error = new Error('未找到该用户名，请先打开一次 Mini App 完成账号识别');
      Object.assign(error, { statusCode: 404 });
      throw error;
    }

    if (user.status === 'BANNED') {
      const error = new Error(user.banReason || '账号已被封禁，无法充值');
      Object.assign(error, { statusCode: 403 });
      throw error;
    }

    return {
      user: serializeExternalRechargeUser(user),
    };
  });

  app.post('/api/external/credits/recharge', async (request, reply) => {
    assertExternalRechargeSecret(request);

    const body = z
      .object({
        requestId: z.string().trim().min(8).max(80),
        telegramUserId: z.coerce.bigint(),
        username: z.string().trim().optional(),
        amount: z.coerce.number().int().positive(),
        provider: z.string().trim().min(1).max(64).default('external_h5'),
        externalPaymentId: z.string().trim().max(191).optional(),
        note: z.string().trim().max(255).optional(),
      })
      .parse(request.body);

    const existing = await prisma.externalCreditRecharge.findUnique({
      where: {
        requestId: body.requestId,
      },
      include: {
        user: true,
      },
    });

    if (existing) {
      return {
        recharge: {
          requestId: existing.requestId,
          status: existing.status,
          amount: existing.amount,
          creditedAt: existing.creditedAt?.toISOString() || null,
        },
        user: publicUser(existing.user),
        idempotent: true,
      };
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: {
          telegramUserId: body.telegramUserId,
        },
      });

      if (!user) {
        const error = new Error('未找到充值目标，请先让用户打开一次 Mini App 完成账号识别');
        Object.assign(error, { statusCode: 404 });
        throw error;
      }

      if (user.status === 'BANNED') {
        const error = new Error(user.banReason || '账号已被封禁，无法充值');
        Object.assign(error, { statusCode: 403 });
        throw error;
      }

      const usernameNormalized = normalizeTelegramUsername(body.username);
      if (
        usernameNormalized &&
        user.usernameNormalized &&
        usernameNormalized !== user.usernameNormalized
      ) {
        const error = new Error('充值用户名与锁定账号不一致，请重新查账号后创建支付订单');
        Object.assign(error, { statusCode: 409 });
        throw error;
      }

      if (body.username && !user.username) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            username: cleanTelegramUsername(body.username),
            usernameNormalized,
          },
        });
      }

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          creditBalance: {
            increment: body.amount,
          },
        },
      });

      const recharge = await tx.externalCreditRecharge.create({
        data: {
          requestId: body.requestId,
          userId: updatedUser.id,
          provider: body.provider,
          externalPaymentId: body.externalPaymentId,
          amount: body.amount,
          status: 'PAID',
          note: body.note,
          rawPayload: JSON.stringify({
            ...body,
            telegramUserId: body.telegramUserId.toString(),
          }),
          creditedAt: new Date(),
        },
      });

      await tx.creditTransaction.create({
        data: {
          userId: updatedUser.id,
          amount: body.amount,
          balanceAfter: updatedUser.creditBalance,
          type: 'external_recharge',
          note: body.note || `外部充值：${body.provider} / ${body.requestId}`,
        },
      });

      return {
        recharge,
        user: updatedUser,
      };
    });

    await logActivity({
      actorType: 'system',
      actorId: body.provider,
      action: 'credits.external_recharge',
      entityType: 'externalCreditRecharge',
      entityId: result.recharge.id,
      message: `外部充值到账：${body.amount}积分`,
      metadata: {
        requestId: body.requestId,
        telegramUserId: body.telegramUserId.toString(),
        provider: body.provider,
      },
      request,
    });

    reply.code(201);

    return {
      recharge: {
        requestId: result.recharge.requestId,
        status: result.recharge.status,
        amount: result.recharge.amount,
        creditedAt: result.recharge.creditedAt?.toISOString() || null,
      },
      user: publicUser(result.user),
      idempotent: false,
    };
  });

  app.get('/api/videos', async (request) => {
    const user = await getCurrentUser(request);
    const [series, videos] = await Promise.all([
      prisma.series.findMany({
        where: {
          status: 'ACTIVE',
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        include: {
          videos: {
            where: {
              status: 'ACTIVE',
            },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
            include: {
              entitlements: {
                where: {
                  userId: user.id,
                  status: 'ACTIVE',
                  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                },
                take: 1,
              },
            },
          },
        },
      }),
      prisma.video.findMany({
      where: {
        status: 'ACTIVE',
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        series: true,
        entitlements: {
          where: {
            userId: user.id,
            status: 'ACTIVE',
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          take: 1,
        },
      },
      }),
    ]);

    const serializeVideo = (video: (typeof videos)[number]) => ({
      id: video.id,
      title: video.title,
      description: video.description,
      thumbnailUrl: video.coverImageUrl,
      priceCents: video.priceCents,
      priceCredits: video.priceCredits,
      currency: video.currency,
      hasAccess: video.entitlements.length > 0,
      series: video.series
        ? {
            id: video.series.id,
            title: video.series.title,
            slug: video.series.slug,
          }
        : null,
    });

    return {
      series: series.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        slug: item.slug,
        videos: item.videos.map((video) => ({
          id: video.id,
          title: video.title,
          description: video.description,
          thumbnailUrl: video.coverImageUrl,
          priceCents: video.priceCents,
          priceCredits: video.priceCredits,
          currency: video.currency,
          hasAccess: video.entitlements.length > 0,
          series: {
            id: item.id,
            title: item.title,
            slug: item.slug,
          },
        })),
      })),
      videos: videos.map(serializeVideo),
    };
  });

  app.get('/api/videos/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const user = await getCurrentUser(request);
    const video = await prisma.video.findUniqueOrThrow({
      where: {
        id,
      },
      include: {
        entitlements: {
          where: {
            userId: user.id,
            status: 'ACTIVE',
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: {
            order: true,
          },
          take: 1,
        },
      },
    });

    return {
      video: {
        id: video.id,
        seriesId: video.seriesId,
        title: video.title,
        description: video.description,
        thumbnailUrl: video.coverImageUrl,
        priceCents: video.priceCents,
        priceCredits: video.priceCredits,
        currency: video.currency,
        hasAccess: video.entitlements.length > 0,
        orderCode: video.entitlements[0]?.order.orderCode,
      },
    };
  });

  app.post('/api/orders', async (request, reply) => {
    reply.code(410);
    return {
      error: '当前项目仅支持 Telegram Stars 支付，请使用 Stars 发票接口',
    };
  });

  app.post('/api/payments/credits/purchase', async (request, reply) => {
    const body = z
      .object({
        videoId: z.coerce.number().int().positive(),
      })
      .parse(request.body);

    const user = await getCurrentUser(request);
    const video = await prisma.video.findFirst({
      where: {
        id: body.videoId,
        status: 'ACTIVE',
      },
    });

    if (!video) {
      const error = new Error('视频不存在或未上架');
      Object.assign(error, { statusCode: 404 });
      throw error;
    }

    if (video.priceCredits <= 0) {
      const error = new Error('该视频暂不支持积分购买');
      Object.assign(error, { statusCode: 400 });
      throw error;
    }

    const existingEntitlement = await prisma.entitlement.findFirst({
      where: {
        userId: user.id,
        videoId: video.id,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        order: true,
      },
    });

    if (existingEntitlement) {
      return {
        alreadyPaid: true,
        user: publicUser(user),
        order: {
          orderCode: existingEntitlement.order.orderCode,
          status: existingEntitlement.order.status,
        },
      };
    }

    const orderCode = makeCode(8);
    const result = await prisma.$transaction(async (tx) => {
      const debit = await tx.user.updateMany({
        where: {
          id: user.id,
          creditBalance: {
            gte: video.priceCredits,
          },
        },
        data: {
          creditBalance: {
            decrement: video.priceCredits,
          },
        },
      });

      if (debit.count !== 1) {
        const error = new Error('积分不足，可使用 Stars 直接购买，或先使用 Stars 兑换积分。');
        Object.assign(error, { statusCode: 402 });
        throw error;
      }

      const updatedUser = await tx.user.findUniqueOrThrow({
        where: {
          id: user.id,
        },
      });

      const order = await tx.order.create({
        data: {
          orderCode,
          userId: user.id,
          videoId: video.id,
          amountCents: video.priceCredits,
          currency: 'CREDITS',
          status: 'PAID',
          provider: 'project_credits',
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

      await tx.creditTransaction.create({
        data: {
          userId: user.id,
          orderId: order.id,
          videoId: video.id,
          amount: -video.priceCredits,
          balanceAfter: updatedUser.creditBalance,
          type: 'video_purchase',
          note: `购买视频：${video.title}`,
        },
      });

      return { order, entitlement, user: updatedUser };
    });

    await logActivity({
      actorType: 'user',
      actorId: user.telegramUserId.toString(),
      action: 'payment.credits_paid',
      entityType: 'order',
      entityId: result.order.id,
      message: `积分购买成功：${result.order.orderCode}`,
      metadata: {
        videoId: video.id,
        credits: video.priceCredits,
      },
      request,
    });

    reply.code(201);

    return {
      alreadyPaid: false,
      user: publicUser(result.user),
      order: {
        orderCode: result.order.orderCode,
        status: result.order.status,
      },
      entitlement: {
        id: result.entitlement.id,
        status: result.entitlement.status,
      },
    };
  });

  app.post('/api/payments/free/claim', async (request, reply) => {
    const body = z
      .object({
        videoId: z.coerce.number().int().positive(),
      })
      .parse(request.body);

    const user = await getCurrentUser(request);
    const video = await prisma.video.findFirst({
      where: {
        id: body.videoId,
        status: 'ACTIVE',
      },
    });

    if (!video) {
      const error = new Error('视频不存在或未上架');
      Object.assign(error, { statusCode: 404 });
      throw error;
    }

    if (video.priceCents > 0) {
      const error = new Error('该视频不是免费内容');
      Object.assign(error, { statusCode: 400 });
      throw error;
    }

    const existingEntitlement = await prisma.entitlement.findFirst({
      where: {
        userId: user.id,
        videoId: video.id,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        order: true,
      },
    });

    if (existingEntitlement) {
      return {
        alreadyPaid: true,
        user: publicUser(user),
        order: {
          orderCode: existingEntitlement.order.orderCode,
          status: existingEntitlement.order.status,
        },
      };
    }

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderCode: makeCode(8),
          userId: user.id,
          videoId: video.id,
          amountCents: 0,
          currency: 'XTR',
          status: 'PAID',
          provider: 'free_claim',
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

      return { order, entitlement };
    });

    await logActivity({
      actorType: 'user',
      actorId: user.telegramUserId.toString(),
      action: 'payment.free_claimed',
      entityType: 'order',
      entityId: result.order.id,
      message: `免费领取：${result.order.orderCode}`,
      metadata: {
        videoId: video.id,
      },
      request,
    });

    reply.code(201);

    return {
      alreadyPaid: false,
      user: publicUser(user),
      order: {
        orderCode: result.order.orderCode,
        status: result.order.status,
      },
      entitlement: {
        id: result.entitlement.id,
        status: result.entitlement.status,
      },
    };
  });

  app.get('/api/credits/packages', async () => {
    const packages = await prisma.creditPackage.findMany({
      where: {
        status: 'ACTIVE',
      },
      orderBy: [{ sortOrder: 'asc' }, { starsAmount: 'asc' }],
    });

    return {
      packages: packages.map((item) => ({
        id: item.id,
        title: item.title,
        starsAmount: item.starsAmount,
        creditsAmount: item.creditsAmount,
      })),
    };
  });

  app.post('/api/payments/credits/exchange/invoice', async (request, reply) => {
    const body = z
      .object({
        packageId: z.coerce.number().int().positive(),
      })
      .parse(request.body);

    const user = await getCurrentUser(request);
    const creditPackage = await prisma.creditPackage.findFirst({
      where: {
        id: body.packageId,
        status: 'ACTIVE',
      },
    });

    if (!creditPackage) {
      const error = new Error('积分套餐不存在或已下架');
      Object.assign(error, { statusCode: 404 });
      throw error;
    }

    const existingPendingOrder = await prisma.rechargeOrder.findFirst({
      where: {
        userId: user.id,
        packageId: creditPackage.id,
        status: 'PENDING',
        provider: 'telegram_stars',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const order =
      existingPendingOrder ||
      (await prisma.rechargeOrder.create({
        data: {
          orderCode: makeCode(8),
          userId: user.id,
          packageId: creditPackage.id,
          starsAmount: creditPackage.starsAmount,
          creditsAmount: creditPackage.creditsAmount,
          currency: 'XTR',
          status: 'PENDING',
          provider: 'telegram_stars',
        },
      }));
    const invoiceLink = await createCreditRechargeInvoiceLink(order.id);

    reply.code(existingPendingOrder ? 200 : 201);

    return {
      invoiceLink,
      order: {
        orderCode: order.orderCode,
        status: order.status,
        starsAmount: order.starsAmount,
        creditsAmount: order.creditsAmount,
      },
    };
  });

  app.post('/api/payments/telegram/invoice', async (request, reply) => {
    const body = z
      .object({
        videoId: z.coerce.number().int().positive(),
      })
      .parse(request.body);

    const user = await getCurrentUser(request);
    const video = await prisma.video.findFirst({
      where: {
        id: body.videoId,
        status: 'ACTIVE',
      },
    });

    if (!video) {
      const error = new Error('视频不存在或未上架');
      Object.assign(error, { statusCode: 404 });
      throw error;
    }

    if (video.priceCents <= 0) {
      const error = new Error('该视频为免费内容，请先免费领取后播放');
      Object.assign(error, { statusCode: 400 });
      throw error;
    }

    const existingEntitlement = await prisma.entitlement.findFirst({
      where: {
        userId: user.id,
        videoId: video.id,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        order: true,
      },
    });

    if (existingEntitlement) {
      return {
        alreadyPaid: true,
        order: {
          orderCode: existingEntitlement.order.orderCode,
          status: existingEntitlement.order.status,
        },
      };
    }

    const existingPendingOrder = await prisma.order.findFirst({
      where: {
        userId: user.id,
        videoId: video.id,
        status: 'PENDING',
        provider: 'telegram_stars',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const order =
      existingPendingOrder ||
      (await prisma.order.create({
        data: {
          orderCode: makeCode(8),
          userId: user.id,
          videoId: video.id,
          amountCents: starsAmountForVideo(video),
          currency: 'XTR',
          status: 'PENDING',
          provider: 'telegram_stars',
        },
      }));

    const invoiceLink = await createTelegramInvoiceLink(order.id);

    reply.code(existingPendingOrder ? 200 : 201);

    return {
      alreadyPaid: false,
      invoiceLink,
      order: {
        orderCode: order.orderCode,
        status: order.status,
      },
    };
  });

  app.post('/api/telegram/webhook', async (request) => {
    if (
      config.TELEGRAM_WEBHOOK_SECRET &&
      request.headers['x-telegram-bot-api-secret-token'] !==
        config.TELEGRAM_WEBHOOK_SECRET
    ) {
      const error = new Error('Invalid Telegram webhook secret');
      Object.assign(error, { statusCode: 401 });
      throw error;
    }

    return handleTelegramPaymentUpdate(request.body as never);
  });

  app.post('/api/orders/:orderCode/mark-paid', async (request) => {
    if (!isDevelopment) {
      throw new Error('This endpoint is only available in development');
    }

    const { orderCode } = z
      .object({
        orderCode: z.string().min(1),
      })
      .parse(request.params);

    const order = await prisma.order.findUniqueOrThrow({
      where: {
        orderCode,
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      await tx.entitlement.upsert({
        where: {
          orderId: order.id,
        },
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

    return {
      ok: true,
    };
  });

  app.post('/api/videos/:id/play', async (request) => {
    const { id } = idParams.parse(request.params);
    const user = await getCurrentUser(request);
    const entitlement = await prisma.entitlement.findFirst({
      where: {
        userId: user.id,
        videoId: id,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        video: true,
        order: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!entitlement) {
      const error = new Error('No active entitlement for this video');
      Object.assign(error, { statusCode: 403 });
      throw error;
    }

    const runtimeSettings = await getRuntimeSettings();
    const maxConcurrent = runtimeSettings.maxConcurrentPlaySessions;

    if (maxConcurrent > 0) {
      const activeSince = new Date(Date.now() - 45_000);
      const activeSessionCount = await prisma.playSession.count({
        where: {
          userId: user.id,
          tokenExpiresAt: { gt: new Date() },
          OR: [
            { lastSeenAt: { gt: activeSince } },
            { lastSeenAt: null, createdAt: { gt: activeSince } },
          ],
        },
      });

      if (activeSessionCount >= maxConcurrent) {
        await createRiskEvent({
          userId: user.id,
          type: 'concurrent_play_blocked',
          severity: 3,
          message: '播放并发超过限制',
          metadata: {
            videoId: id,
            maxConcurrent,
            ipAddress: request.ip,
          },
        });
        const error = new Error('当前账号已有播放会话，请关闭其他播放窗口后再试');
        Object.assign(error, { statusCode: 429 });
        throw error;
      }
    }

    const playback = await createPlaybackUrl(entitlement.video.cloudflareVideoUid);
    const sessionCode = makeCode(10);

    const playSession = await prisma.playSession.create({
      data: {
        sessionCode,
        userId: user.id,
        videoId: entitlement.videoId,
        orderId: entitlement.orderId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']?.toString(),
        tokenExpiresAt: playback.tokenExpiresAt,
      },
    });

    await logActivity({
      actorType: 'user',
      actorId: user.telegramUserId.toString(),
      action: 'play_session.start',
      entityType: 'playSession',
      entityId: playSession.id,
      message: `开始播放：${entitlement.video.title}`,
      metadata: {
        orderCode: entitlement.order.orderCode,
        videoId: entitlement.videoId,
      },
      request,
    });

    return {
      playbackUrl: playback.playbackUrl,
      signed: playback.signed,
      tokenExpiresAt: playback.tokenExpiresAt.toISOString(),
      sessionCode,
      watermarks: {
        orderCode: entitlement.order.orderCode,
        official: runtimeSettings.officialWatermarkText,
      },
    };
  });

  app.post('/api/play-sessions/:sessionCode/events', async (request) => {
    const { sessionCode } = z
      .object({
        sessionCode: z.string().min(1),
      })
      .parse(request.params);

    const body = z
      .object({
        eventType: z.enum(['play', 'pause', 'seek', 'heartbeat', 'ended']),
        playbackPositionSeconds: z.number().int().nonnegative().optional(),
      })
      .parse(request.body);

    const playSession = await prisma.playSession.findUniqueOrThrow({
      where: {
        sessionCode,
      },
    });

    if (playSession.ipAddress && playSession.ipAddress !== request.ip) {
      await createRiskEvent({
        userId: playSession.userId,
        playSessionId: playSession.id,
        type: 'play_ip_changed',
        severity: 2,
        message: '播放会话 IP 发生变化',
        metadata: {
          originalIp: playSession.ipAddress,
          currentIp: request.ip,
          eventType: body.eventType,
        },
      });
    }

    await prisma.playEvent.create({
      data: {
        playSessionId: playSession.id,
        eventType: body.eventType,
        playbackPositionSeconds: body.playbackPositionSeconds,
      },
    });

    await prisma.playSession
      .update({
        where: {
          id: playSession.id,
        },
        data: {
          lastSeenAt: new Date(),
        },
      })
      .catch(() => undefined);

    return {
      ok: true,
    };
  });

  app.post('/api/play-sessions/:sessionCode/end', async (request) => {
    const user = await getCurrentUser(request);
    const { sessionCode } = z
      .object({
        sessionCode: z.string().min(1),
      })
      .parse(request.params);

    const playSession = await prisma.playSession.findFirstOrThrow({
      where: {
        sessionCode,
        userId: user.id,
      },
    });

    await prisma.$transaction([
      prisma.playEvent.create({
        data: {
          playSessionId: playSession.id,
          eventType: 'ended',
        },
      }),
      prisma.playSession.update({
        where: {
          id: playSession.id,
        },
        data: {
          lastSeenAt: new Date(),
          tokenExpiresAt: new Date(),
        },
      }),
    ]);

    return {
      ok: true,
    };
  });
}
