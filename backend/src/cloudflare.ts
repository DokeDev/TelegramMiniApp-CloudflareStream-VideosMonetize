import { createPrivateKey } from 'node:crypto';
import { SignJWT } from 'jose';
import { config } from './config.js';
import { getRuntimeSettings } from './settings.js';

export async function createPlaybackUrl(cloudflareVideoUid: string) {
  const asset = await createStreamAsset(cloudflareVideoUid);

  return {
    playbackUrl: `https://iframe.videodelivery.net/${asset.assetId}`,
    tokenExpiresAt: asset.tokenExpiresAt,
    signed: asset.signed,
  };
}

export async function createThumbnailUrl(cloudflareVideoUid: string) {
  const settings = await getRuntimeSettings();
  const asset = await createStreamAsset(cloudflareVideoUid, settings);
  const baseUrl =
    normalizeCustomerSubdomain(settings.cloudflareCustomerSubdomain) ||
    'https://videodelivery.net';

  return `${baseUrl}/${asset.assetId}/thumbnails/thumbnail.jpg?time=1s&height=360&fit=crop`;
}

async function createStreamAsset(
  cloudflareVideoUid: string,
  runtimeSettings?: Awaited<ReturnType<typeof getRuntimeSettings>>,
) {
  const settings = runtimeSettings || (await getRuntimeSettings());
  const expiresAt = new Date(Date.now() + config.TOKEN_TTL_SECONDS * 1000);

  if (
    !settings.cloudflareStreamSigningKeyId ||
    !settings.cloudflareStreamSigningPrivateKey ||
    cloudflareVideoUid === 'demo-video-uid'
  ) {
    return {
      assetId: cloudflareVideoUid,
      tokenExpiresAt: expiresAt,
      signed: false,
    };
  }

  const privateKeyText = normalizePrivateKey(settings.cloudflareStreamSigningPrivateKey);
  const privateKey = createPrivateKey(privateKeyText);

  const assetId = await new SignJWT({
    sub: cloudflareVideoUid,
    kid: settings.cloudflareStreamSigningKeyId,
    downloadable: false,
  })
    .setProtectedHeader({
      alg: 'RS256',
      kid: settings.cloudflareStreamSigningKeyId,
    })
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(privateKey);

  return {
    assetId,
    tokenExpiresAt: expiresAt,
    signed: true,
  };
}

function normalizeCustomerSubdomain(value: string | undefined) {
  const trimmed = value?.trim().replace(/\/+$/, '');

  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  if (trimmed.includes('.')) {
    return `https://${trimmed}`;
  }

  const subdomain = trimmed.startsWith('customer-') ? trimmed : `customer-${trimmed}`;

  return `https://${subdomain}.cloudflarestream.com`;
}

function normalizePrivateKey(value: string) {
  const normalized = value.trim().replace(/\\n/g, '\n');

  if (normalized.includes('PRIVATE KEY')) {
    return normalized;
  }

  const decoded = Buffer.from(normalized, 'base64').toString('utf8').trim();

  if (decoded.includes('PRIVATE KEY')) {
    return decoded;
  }

  throw new Error('Cloudflare Stream Signing Private Key 格式不正确');
}
