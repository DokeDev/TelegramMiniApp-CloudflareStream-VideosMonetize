import type { FastifyRequest } from 'fastify';
import { prisma } from './db.js';
import { getRuntimeSettings } from './settings.js';
import { parseAndValidateTelegramInitData } from './telegram.js';
import { cleanTelegramUsername, normalizeTelegramUsername } from './username.js';

export async function getCurrentUser(request: FastifyRequest) {
  const initData =
    request.headers['x-telegram-init-data']?.toString() ||
    request.headers.authorization?.replace(/^tma\s+/i, '');

  const settings = await getRuntimeSettings();
  const telegramUser = parseAndValidateTelegramInitData(
    initData,
    settings.telegramBotToken,
  );

  const user = await prisma.user.upsert({
    where: {
      telegramUserId: telegramUser.telegramUserId,
    },
    update: {
      username: cleanTelegramUsername(telegramUser.username),
      usernameNormalized: normalizeTelegramUsername(telegramUser.username),
      firstName: telegramUser.firstName,
      lastName: telegramUser.lastName,
      languageCode: telegramUser.languageCode,
    },
    create: {
      ...telegramUser,
      username: cleanTelegramUsername(telegramUser.username),
      usernameNormalized: normalizeTelegramUsername(telegramUser.username),
    },
  });

  if (user.status === 'BANNED') {
    const error = new Error(user.banReason || '账号已被封禁');
    Object.assign(error, { statusCode: 403 });
    throw error;
  }

  return user;
}

export function publicUser(user: {
  id: number;
  telegramUserId: bigint;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string;
  creditBalance: number;
}) {
  return {
    id: user.id,
    telegramUserId: user.telegramUserId.toString(),
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    creditBalance: user.creditBalance,
  };
}
