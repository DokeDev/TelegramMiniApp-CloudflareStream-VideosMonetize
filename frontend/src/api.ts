const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:18763';

export type Video = {
  id: number;
  title: string;
  description: string | null;
  thumbnailUrl?: string | null;
  priceCents: number;
  priceCredits: number;
  currency: string;
  hasAccess: boolean;
  series: {
    id: number;
    title: string;
    slug: string;
  } | null;
};

export type PlayResponse = {
  playbackUrl: string;
  signed: boolean;
  tokenExpiresAt: string;
  sessionCode: string;
  watermarks: {
    orderCode: string;
    official: string;
  };
};

function telegramInitData() {
  return window.Telegram?.WebApp.initData || '';
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'x-telegram-init-data': telegramInitData(),
  };

  if (options.body) {
    headers['content-type'] = 'application/json';
  }

  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || response.statusText);
  }

  return response.json() as Promise<T>;
}

export async function adminFetch<T>(
  path: string,
  adminCredential: string,
  options: RequestInit = {},
): Promise<T> {
  return apiFetch<T>(path, {
    ...options,
    headers: {
      authorization: `Bearer ${adminCredential}`,
      ...options.headers,
    },
  });
}
