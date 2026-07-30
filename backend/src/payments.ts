import { prisma } from './db.js';
import { logActivity } from './activity.js';
import { getRuntimeSettings } from './settings.js';

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type TelegramUpdate = {
  update_id: number;
  pre_checkout_query?: {
    id: string;
    invoice_payload: string;
    currency: string;
    total_amount: number;
  };
  message?: {
    successful_payment?: {
      currency: string;
      total_amount: number;
      invoice_payload: string;
      telegram_payment_charge_id: string;
      provider_payment_charge_id?: string;
    };
  };
};

async function telegramApi<T>(
  method: string,
  body: Record<string, unknown>,
  botToken?: string,
) {
  const settings = await getRuntimeSettings();
  const token = botToken || settings.telegramBotToken;

  if (!token) {
    throw new Error('Telegram Bot Token 未配置');
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as TelegramApiResponse<T>;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || `Telegram API ${method} failed`);
  }

  return payload.result as T;
}

export function paymentPayload(orderCode: string) {
  return `order:${orderCode}`;
}

export function rechargePaymentPayload(orderCode: string) {
  return `recharge:${orderCode}`;
}

export function starsAmountForVideo(video: { priceCents: number; currency: string }) {
  if (video.currency === 'XTR') {
    return Math.max(1, video.priceCents);
  }

  return Math.max(1, Math.ceil(video.priceCents / 100));
}

function parsePaymentPayload(payload: string) {
  if (payload.startsWith('order:')) {
    return {
      type: 'order' as const,
      orderCode: payload.slice('order:'.length),
    };
  }

  if (payload.startsWith('recharge:')) {
    return {
      type: 'recharge' as const,
      orderCode: payload.slice('recharge:'.length),
    };
  }

  return null;
}

export async function createTelegramInvoiceLink(orderId: number) {
  const settings = await getRuntimeSettings();

  if (!settings.telegramPaymentsEnabled) {
    throw new Error('Telegram Stars 支付未启用');
  }

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      video: true,
    },
  });

  return telegramApi<string>('createInvoiceLink', {
    title: order.video.title,
    description: order.video.description || order.video.title,
    payload: paymentPayload(order.orderCode),
    provider_token: '',
    currency: 'XTR',
    prices: [
      {
        label: order.video.title,
        amount: order.amountCents,
      },
    ],
  });
}

export async function createCreditRechargeInvoiceLink(rechargeOrderId: number) {
  const settings = await getRuntimeSettings();

  if (!settings.telegramPaymentsEnabled) {
    throw new Error('Telegram Stars 支付未启用');
  }

  const order = await prisma.rechargeOrder.findUniqueOrThrow({
    where: { id: rechargeOrderId },
    include: {
      package: true,
    },
  });

  return telegramApi<string>('createInvoiceLink', {
    title: '使用 Stars 兑换积分',
    description: `${order.starsAmount}Stars = ${order.creditsAmount}积分`,
    payload: rechargePaymentPayload(order.orderCode),
    provider_token: '',
    currency: 'XTR',
    prices: [
      {
        label: order.package.title,
        amount: order.starsAmount,
      },
    ],
  });
}

export async function answerPreCheckoutQuery(
  queryId: string,
  ok: boolean,
  errorMessage?: string,
) {
  return telegramApi<boolean>('answerPreCheckoutQuery', {
    pre_checkout_query_id: queryId,
    ok,
    error_message: errorMessage,
  });
}

export async function markOrderPaidFromTelegram(
  orderCode: string,
  payment: {
    currency: string;
    total_amount: number;
    telegram_payment_charge_id: string;
    provider_payment_charge_id?: string;
  },
) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { orderCode },
  });

  if (
    order.currency !== payment.currency ||
    order.amountCents !== payment.total_amount
  ) {
    throw new Error('Telegram payment amount does not match order');
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        provider: 'telegram_stars',
        providerPaymentId:
          payment.provider_payment_charge_id ||
          payment.telegram_payment_charge_id,
        paidAt: new Date(),
      },
    });

    await tx.entitlement.upsert({
      where: { orderId: order.id },
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
    actorType: 'system',
    action: 'payment.telegram_paid',
    entityType: 'order',
    entityId: order.id,
    message: `Telegram Stars 支付成功：${order.orderCode}`,
    metadata: {
      providerPaymentId:
        payment.provider_payment_charge_id ||
        payment.telegram_payment_charge_id,
    },
  });
}

export async function markRechargePaidFromTelegram(
  orderCode: string,
  payment: {
    currency: string;
    total_amount: number;
    telegram_payment_charge_id: string;
    provider_payment_charge_id?: string;
  },
) {
  const order = await prisma.rechargeOrder.findUniqueOrThrow({
    where: { orderCode },
  });

  if (
    order.currency !== payment.currency ||
    order.starsAmount !== payment.total_amount
  ) {
    throw new Error('Telegram recharge amount does not match order');
  }

  const paidOrder = await prisma.$transaction(async (tx) => {
    const updatedOrder = await tx.rechargeOrder.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        provider: 'telegram_stars',
        providerPaymentId:
          payment.provider_payment_charge_id ||
          payment.telegram_payment_charge_id,
        paidAt: new Date(),
      },
    });
    const updatedUser = await tx.user.update({
      where: { id: order.userId },
      data: {
        creditBalance: {
          increment: order.creditsAmount,
        },
      },
    });

    await tx.creditTransaction.create({
      data: {
        userId: order.userId,
        rechargeOrderId: order.id,
        amount: order.creditsAmount,
        balanceAfter: updatedUser.creditBalance,
        type: 'stars_exchange',
        note: `使用 Stars 兑换积分：${order.starsAmount}Stars = ${order.creditsAmount}积分`,
      },
    });

    return updatedOrder;
  });

  await logActivity({
    actorType: 'system',
    action: 'credits.stars_exchanged',
    entityType: 'rechargeOrder',
    entityId: paidOrder.id,
    message: `使用 Stars 兑换积分成功：${paidOrder.orderCode}`,
    metadata: {
      providerPaymentId:
        payment.provider_payment_charge_id ||
        payment.telegram_payment_charge_id,
      starsAmount: paidOrder.starsAmount,
      creditsAmount: paidOrder.creditsAmount,
    },
  });
}

async function findPaymentForPreCheckout(payload: {
  type: 'order' | 'recharge';
  orderCode: string;
}) {
  if (payload.type === 'order') {
    const order = await prisma.order.findUnique({
      where: { orderCode: payload.orderCode },
    });

    return order
      ? {
          status: order.status,
          currency: order.currency,
          amount: order.amountCents,
        }
      : null;
  }

  const order = await prisma.rechargeOrder.findUnique({
    where: { orderCode: payload.orderCode },
  });

  return order
    ? {
        status: order.status,
        currency: order.currency,
        amount: order.starsAmount,
      }
    : null;
}

export async function handleTelegramPaymentUpdate(update: TelegramUpdate) {
  const preCheckout = update.pre_checkout_query;

  if (preCheckout) {
    const payload = parsePaymentPayload(preCheckout.invoice_payload);

    if (!payload) {
      await answerPreCheckoutQuery(preCheckout.id, false, '订单无效');
      return { ok: true, handled: 'pre_checkout_rejected' };
    }

    const payment = await findPaymentForPreCheckout(payload);

    if (
      !payment ||
      payment.status === 'PAID' ||
      payment.currency !== preCheckout.currency ||
      payment.amount !== preCheckout.total_amount
    ) {
      await answerPreCheckoutQuery(preCheckout.id, false, '订单状态或金额不匹配');
      return { ok: true, handled: 'pre_checkout_rejected' };
    }

    await answerPreCheckoutQuery(preCheckout.id, true);
    return { ok: true, handled: 'pre_checkout_approved' };
  }

  const successfulPayment = update.message?.successful_payment;

  if (successfulPayment) {
    const payload = parsePaymentPayload(successfulPayment.invoice_payload);

    if (payload?.type === 'order') {
      await markOrderPaidFromTelegram(payload.orderCode, successfulPayment);
    }

    if (payload?.type === 'recharge') {
      await markRechargePaidFromTelegram(payload.orderCode, successfulPayment);
    }

    return { ok: true, handled: 'successful_payment' };
  }

  return { ok: true, handled: 'ignored' };
}
