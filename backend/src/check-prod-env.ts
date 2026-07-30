import 'dotenv/config';
import { config } from './config.js';

const required: Array<[string, unknown]> = [
  ['APP_ENV=production', config.APP_ENV === 'production'],
  ['HOST=0.0.0.0', config.HOST === '0.0.0.0'],
  ['PUBLIC_BASE_URL', config.PUBLIC_BASE_URL],
  ['DATABASE_URL', config.DATABASE_URL],
  ['ADMIN_USERNAME', config.ADMIN_USERNAME && config.ADMIN_USERNAME !== 'admin'],
  [
    'ADMIN_PASSWORD length >= 12 and not default',
    config.ADMIN_PASSWORD &&
      config.ADMIN_PASSWORD !== 'admin123' &&
      config.ADMIN_PASSWORD.length >= 12,
  ],
  [
    'ADMIN_SESSION_SECRET length >= 32',
    config.ADMIN_SESSION_SECRET && config.ADMIN_SESSION_SECRET.length >= 32,
  ],
  ['ADMIN_ALLOW_PASSWORD_HEADER=false', config.ADMIN_ALLOW_PASSWORD_HEADER === false],
  ['SECURITY_HEADERS_ENABLED=true', config.SECURITY_HEADERS_ENABLED === true],
  ['RATE_LIMIT_ENABLED=true', config.RATE_LIMIT_ENABLED === true],
  ['TELEGRAM_BOT_TOKEN', config.TELEGRAM_BOT_TOKEN],
  ['TELEGRAM_WEBHOOK_SECRET', config.TELEGRAM_WEBHOOK_SECRET],
  ['CLOUDFLARE_ACCOUNT_ID or admin setting', true],
  ['CLOUDFLARE_API_TOKEN or admin setting', true],
  ['CLOUDFLARE_STREAM_SIGNING_KEY_ID or admin setting', true],
  ['CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY or admin setting', true],
];

const missing = required
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length) {
  console.error('Production environment check failed:');
  missing.forEach((name) => console.error(`- ${name}`));
  process.exit(1);
}

console.log('Production environment check passed');
