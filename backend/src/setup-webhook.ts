import 'dotenv/config';
import { config } from './config.js';

type TelegramResponse = {
  ok: boolean;
  result?: boolean;
  description?: string;
};

if (!config.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is required');
}

if (!config.PUBLIC_BASE_URL) {
  throw new Error('PUBLIC_BASE_URL is required');
}

const webhookUrl = new URL('/api/telegram/webhook', config.PUBLIC_BASE_URL);
const body: Record<string, unknown> = {
  url: webhookUrl.toString(),
  drop_pending_updates: false,
};

if (config.TELEGRAM_WEBHOOK_SECRET) {
  body.secret_token = config.TELEGRAM_WEBHOOK_SECRET;
}

const response = await fetch(
  `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/setWebhook`,
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  },
);
const payload = (await response.json()) as TelegramResponse;

if (!response.ok || !payload.ok) {
  throw new Error(payload.description || 'Telegram setWebhook failed');
}

console.log(`Telegram webhook set to ${webhookUrl.toString()}`);
