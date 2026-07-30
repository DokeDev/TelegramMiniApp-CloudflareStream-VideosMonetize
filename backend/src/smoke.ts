const API_BASE_URL = process.env.SMOKE_API_BASE_URL || 'http://127.0.0.1:18763';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
let adminToken = '';

async function loginAdmin() {
  const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    }),
  });
  const body = await response
    .json()
    .catch(() => ({ error: response.statusText }));

  if (!response.ok) {
    throw new Error(body.error || response.statusText);
  }

  adminToken = body.token;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${adminToken}`,
  };

  if (options.body) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  const body = await response
    .json()
    .catch(() => ({ error: response.statusText }));

  if (!response.ok) {
    throw new Error(body.error || response.statusText);
  }

  return body as T;
}

async function main() {
  await loginAdmin();

  const health = await request<{ ok: boolean }>('/health');

  if (!health.ok) {
    throw new Error('Health check failed');
  }

  const videosResponse = await request<{
    videos: Array<{ id: number; title: string }>;
  }>('/api/admin/videos');
  const video = videosResponse.videos[0];

  if (!video) {
    throw new Error('No videos available for smoke test');
  }

  const telegramUserId = String(Date.now());
  const testOrder = await request<{
    order: { id: number; orderCode: string; status: string };
  }>('/api/admin/dev/test-order', {
    method: 'POST',
    body: JSON.stringify({
      telegramUserId,
      videoId: video.id,
      provider: 'telegram_stars',
      paid: false,
    }),
  });

  if (testOrder.order.status !== 'PENDING') {
    throw new Error('Expected test order to be PENDING');
  }

  await request('/api/admin/dev/simulate-telegram-payment', {
    method: 'POST',
    body: JSON.stringify({
      orderCode: testOrder.order.orderCode,
    }),
  });

  const orderDetail = await request<{
    order: {
      status: string;
      entitlement: { status: string } | null;
    };
  }>(`/api/admin/orders/${testOrder.order.id}`);

  if (
    orderDetail.order.status !== 'PAID' ||
    orderDetail.order.entitlement?.status !== 'ACTIVE'
  ) {
    throw new Error('Simulated payment did not grant active entitlement');
  }

  const logs = await request<{ logs: Array<{ action: string }> }>(
    '/api/admin/activity-logs?q=simulate_telegram_payment',
  );

  if (!logs.logs.length) {
    throw new Error('Expected simulate payment activity log');
  }

  console.log(
    `Smoke test passed: ${testOrder.order.orderCode} paid and entitlement granted for ${video.title}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
