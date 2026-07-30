import { createHmac, timingSafeEqual } from 'node:crypto';
import { config, isDevelopment } from './config.js';

export type TelegramUserData = {
  telegramUserId: bigint;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
};

type InitDataUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};

export function parseAndValidateTelegramInitData(
  initData: string | undefined,
  botToken: string | undefined,
): TelegramUserData {
  if (!initData && isDevelopment) {
    return {
      telegramUserId: config.DEV_TELEGRAM_USER_ID,
      username: config.DEV_TELEGRAM_USERNAME,
      firstName: 'Dev',
      lastName: 'Buyer',
      languageCode: 'zh',
    };
  }

  if (!initData) {
    const error = new Error('请从 Telegram 中打开你的 Bot');
    Object.assign(error, { statusCode: 401 });
    throw error;
  }

  if (!botToken) {
    const error = new Error('Missing TELEGRAM_BOT_TOKEN');
    Object.assign(error, { statusCode: 500 });
    throw error;
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');

  if (!hash) {
    const error = new Error('请从 Telegram 中打开你的 Bot');
    Object.assign(error, { statusCode: 401 });
    throw error;
  }

  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calculatedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const expected = Buffer.from(hash, 'hex');
  const actual = Buffer.from(calculatedHash, 'hex');

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    const error = new Error('Telegram 授权信息无效，请重新从 Telegram 中打开你的 Bot');
    Object.assign(error, { statusCode: 401 });
    throw error;
  }

  const authDate = Number(params.get('auth_date') || 0);
  const now = Math.floor(Date.now() / 1000);

  if (!authDate || now - authDate > 86400) {
    const error = new Error('Telegram 授权已过期，请重新从 Telegram 中打开你的 Bot');
    Object.assign(error, { statusCode: 401 });
    throw error;
  }

  const userJson = params.get('user');

  if (!userJson) {
    const error = new Error('请从 Telegram 中打开你的 Bot');
    Object.assign(error, { statusCode: 401 });
    throw error;
  }

  const user = JSON.parse(userJson) as InitDataUser;

  return {
    telegramUserId: BigInt(user.id),
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    languageCode: user.language_code,
  };
}
