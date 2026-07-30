import {
  AlertTriangle,
  BarChart3,
  Ban,
  CheckCircle2,
  Cloud,
  CreditCard,
  ClipboardList,
  EyeOff,
  FileText,
  FileVideo,
  Gauge,
  KeyRound,
  ListTree,
  Loader2,
  PlaySquare,
  RefreshCw,
  Save,
  Shield,
  ShoppingBag,
  UploadCloud,
  Users,
  Wrench,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { adminFetch, apiFetch } from './api';

type FieldStatus = {
  value: string;
  hasValue: boolean;
  masked: string | null;
};

type AdminSettings = {
  telegramBotToken: FieldStatus;
  telegramPaymentsEnabled: FieldStatus;
  cloudflareAccountId: FieldStatus;
  cloudflareApiToken: FieldStatus;
  cloudflareCustomerSubdomain: FieldStatus;
  cloudflareStreamSigningKeyId: FieldStatus;
  cloudflareStreamSigningPrivateKey: FieldStatus;
  demoCloudflareVideoUid: FieldStatus;
  officialWatermarkText: FieldStatus;
  maxConcurrentPlaySessions: FieldStatus;
};

type CloudflareVideo = {
  uid: string;
  name: string;
  state?: string;
  duration?: number;
  created?: string;
};

type LocalVideo = {
  id: number;
  seriesId: number | null;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  cloudflareVideoUid: string;
  priceCents: number;
  priceCredits: number;
  currency: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  sortOrder: number;
  series: {
    id: number;
    title: string;
    slug: string;
  } | null;
  counts: {
    orders: number;
    entitlements: number;
    playSessions: number;
  };
};

type LocalSeries = {
  id: number;
  title: string;
  description: string | null;
  slug: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  sortOrder: number;
  counts: {
    videos: number;
  };
};

type AdminOrder = {
  id: number;
  orderCode: string;
  amountCents: number;
  currency: string;
  status: string;
  provider: string;
  providerPaymentId?: string | null;
  paidAt?: string | null;
  createdAt: string;
  user: {
    telegramUserId: string;
    username: string | null;
    firstName?: string | null;
  };
  video: {
    id: number;
    title: string;
  };
  entitlement: {
    id: number;
    status: string;
  } | null;
};

type AdminOrderDetail = AdminOrder & {
  updatedAt: string;
  user: AdminOrder['user'] & {
    id: number;
    lastName?: string | null;
    languageCode?: string | null;
    createdAt: string;
  };
  video: AdminOrder['video'] & {
    cloudflareVideoUid: string;
    priceCents: number;
    priceCredits: number;
    currency: string;
    status: string;
  };
  entitlement: {
    id: number;
    status: string;
    startsAt?: string;
    createdAt?: string;
    expiresAt?: string | null;
    revokedAt?: string | null;
  } | null;
  playSessions: Array<{
    id: number;
    sessionCode: string;
    ipAddress: string | null;
    userAgent: string | null;
    tokenExpiresAt: string;
    createdAt: string;
    lastSeenAt: string | null;
    eventCount: number;
  }>;
};

type AdminUser = {
  id: number;
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
  status: string;
  bannedAt: string | null;
  banReason: string | null;
  riskScore: number;
  creditBalance: number;
  createdAt: string;
  counts: {
    orders: number;
    entitlements: number;
    playSessions: number;
  };
};

type AdminUserDetail = AdminUser & {
  lastName: string | null;
  languageCode: string | null;
  orders: Array<{
    id: number;
    orderCode: string;
    status: string;
    provider: string;
    amountCents: number;
    currency: string;
    paidAt: string | null;
    createdAt: string;
    video: {
      id: number;
      title: string;
    };
    entitlement: {
      id: number;
      status: string;
    } | null;
  }>;
  entitlements: Array<{
    id: number;
    status: string;
    startsAt: string;
    expiresAt: string | null;
    revokedAt: string | null;
    video: {
      id: number;
      title: string;
    };
    order: {
      id: number;
      orderCode: string;
    };
  }>;
  playSessions: Array<{
    id: number;
    sessionCode: string;
    ipAddress: string | null;
    createdAt: string;
    lastSeenAt: string | null;
    eventCount: number;
    video: {
      id: number;
      title: string;
    };
    order: {
      id: number;
      orderCode: string;
    };
  }>;
  creditTransactions: Array<{
    id: number;
    type: string;
    amount: number;
    balanceAfter: number;
    note: string | null;
    createdAt: string;
    order: {
      id: number;
      orderCode: string;
    } | null;
    video: {
      id: number;
      title: string;
    } | null;
  }>;
};

type PlaySession = {
  id: number;
  sessionCode: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  eventCount: number;
  user: {
    telegramUserId: string;
    username: string | null;
  };
  video: {
    title: string;
  };
  order: {
    orderCode: string;
  };
};

type PlayEvent = {
  id: number;
  eventType: string;
  playbackPositionSeconds: number | null;
  createdAt: string;
};

type PlaySessionDetail = PlaySession & {
  tokenExpiresAt: string;
  events: PlayEvent[];
};

type ActivityLog = {
  id: number;
  actorType: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  message: string;
  metadata: string | null;
  ipAddress: string | null;
  createdAt: string;
};

type Overview = {
  stats: {
    userCount: number;
    seriesCount: number;
    videoCount: number;
    activeVideoCount: number;
    orderCount: number;
    paidOrderCount: number;
    activeEntitlementCount: number;
    playSessionCount: number;
    openRiskEventCount: number;
    bannedUserCount: number;
  };
  dailyMetrics: Array<{
    date: string;
    orders: number;
    paidOrders: number;
    starsRevenue: number;
    creditRevenue: number;
    playSessions: number;
    riskEvents: number;
  }>;
  recentOrders: AdminOrder[];
};

type ExternalRecharge = {
  id: number;
  requestId: string;
  provider: string;
  externalPaymentId: string | null;
  amount: number;
  status: string;
  note: string | null;
  creditedAt: string | null;
  createdAt: string;
  user: AdminUser;
};

type RiskEvent = {
  id: number;
  type: string;
  severity: number;
  status: string;
  message: string;
  metadata: string | null;
  createdAt: string;
  resolvedAt: string | null;
  user: AdminUser | null;
  playSession: {
    id: number;
    sessionCode: string;
    ipAddress: string | null;
    video: { id: number; title: string };
    order: { id: number; orderCode: string };
  } | null;
};

type PolicyDocument = {
  id: number;
  slug: string;
  title: string;
  content: string;
  status: 'PUBLISHED' | 'DRAFT';
  updatedAt: string;
};

type AdminLoginResponse = {
  token: string;
  expiresAt: string;
};

type TabKey =
  | 'overview'
  | 'settings'
  | 'payments'
  | 'series'
  | 'videos'
  | 'cloudflare'
  | 'orders'
  | 'users'
  | 'sessions'
  | 'risk'
  | 'policies'
  | 'logs'
  | 'devtools';

const tabs: Array<{ key: TabKey; label: string; icon: typeof Gauge }> = [
  { key: 'overview', label: '概览', icon: Gauge },
  { key: 'settings', label: '配置', icon: KeyRound },
  { key: 'payments', label: '支付', icon: CreditCard },
  { key: 'series', label: '系列', icon: ListTree },
  { key: 'videos', label: '视频', icon: FileVideo },
  { key: 'cloudflare', label: 'Cloudflare', icon: Cloud },
  { key: 'orders', label: '订单', icon: ShoppingBag },
  { key: 'users', label: '用户', icon: Users },
  { key: 'sessions', label: '播放', icon: PlaySquare },
  { key: 'risk', label: '风控', icon: AlertTriangle },
  { key: 'policies', label: '协议', icon: FileText },
  { key: 'logs', label: '日志', icon: ClipboardList },
  { key: 'devtools', label: '开发', icon: Wrench },
];

const emptySettingsForm = {
  telegramBotToken: '',
  telegramPaymentsEnabled: 'false',
  cloudflareAccountId: '',
  cloudflareApiToken: '',
  cloudflareCustomerSubdomain: '',
  cloudflareStreamSigningKeyId: '',
  cloudflareStreamSigningPrivateKey: '',
  demoCloudflareVideoUid: '',
  officialWatermarkText: 'Official',
  maxConcurrentPlaySessions: '1',
};

const emptyVideoForm = {
  seriesId: '',
  title: '',
  description: '',
  coverImageUrl: '',
  cloudflareVideoUid: '',
  priceCents: '300',
  priceCredits: '280',
  currency: 'XTR',
  status: 'ACTIVE',
  sortOrder: '0',
};

const emptySeriesForm = {
  title: '',
  description: '',
  slug: '',
  status: 'ACTIVE',
  sortOrder: '0',
};

function creditsFromStars(value: string | number) {
  const stars = Number(value);

  if (!Number.isFinite(stars)) {
    return '1';
  }

  return String(Math.max(1, Math.floor(stars) - 20));
}

export function AdminApp() {
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminToken, setAdminToken] = useState(
    sessionStorage.getItem('adminToken') || '',
  );
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [settingsForm, setSettingsForm] = useState(emptySettingsForm);
  const [seriesForm, setSeriesForm] = useState(emptySeriesForm);
  const [videoForm, setVideoForm] = useState(emptyVideoForm);
  const [editingSeriesId, setEditingSeriesId] = useState<number | null>(null);
  const [editSeriesForm, setEditSeriesForm] = useState(emptySeriesForm);
  const [editingVideoId, setEditingVideoId] = useState<number | null>(null);
  const [editVideoForm, setEditVideoForm] = useState(emptyVideoForm);
  const [grantForm, setGrantForm] = useState({
    telegramUserId: '',
    username: '',
    videoId: '',
    creditAmount: '11',
    creditNote: '后台调整积分',
  });
  const [filters, setFilters] = useState({
    videos: '',
    videoStatus: '',
    videoSeriesId: '',
    series: '',
    seriesStatus: '',
    orders: '',
    orderStatus: '',
    orderProvider: '',
    users: '',
    userStatus: '',
    sessions: '',
    risk: '',
    riskStatus: 'OPEN',
    logs: '',
  });
  const [devForm, setDevForm] = useState({
    telegramUserId: '20001',
    username: 'testbuyer',
    videoId: '',
    provider: 'telegram_stars',
    paid: 'false',
    orderCode: '',
  });
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [seriesList, setSeriesList] = useState<LocalSeries[]>([]);
  const [localVideos, setLocalVideos] = useState<LocalVideo[]>([]);
  const [cloudflareVideos, setCloudflareVideos] = useState<CloudflareVideo[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderDetail | null>(null);
  const [externalRecharges, setExternalRecharges] = useState<ExternalRecharge[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [sessions, setSessions] = useState<PlaySession[]>([]);
  const [selectedSession, setSelectedSession] = useState<PlaySessionDetail | null>(null);
  const [riskEvents, setRiskEvents] = useState<RiskEvent[]>([]);
  const [policies, setPolicies] = useState<PolicyDocument[]>([]);
  const [editingPolicy, setEditingPolicy] = useState<PolicyDocument | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [batchImportText, setBatchImportText] = useState('');
  const [cloudflareUploadForm, setCloudflareUploadForm] = useState({
    title: '',
    seriesId: '',
    coverImageUrl: '',
    maxDurationSeconds: '3600',
  });
  const [cloudflareUploadFile, setCloudflareUploadFile] = useState<File | null>(null);
  const [cloudflareUploadProgress, setCloudflareUploadProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const isAuthed = Boolean(settings);
  const adminCredential = adminToken;

  const activeVideos = useMemo(
    () => localVideos.filter((video) => video.status === 'ACTIVE'),
    [localVideos],
  );
  const editingSeries = useMemo(
    () => seriesList.find((series) => series.id === editingSeriesId) || null,
    [editingSeriesId, seriesList],
  );
  const editingVideo = useMemo(
    () => localVideos.find((video) => video.id === editingVideoId) || null,
    [editingVideoId, localVideos],
  );

  useEffect(() => {
    if (adminToken) {
      void loadAll(adminToken);
    }
  }, []);

  function showError(caught: unknown, fallback: string) {
    setError(caught instanceof Error ? caught.message : fallback);
  }

  function makeQuery(params: Record<string, string>) {
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value.trim()) {
        query.set(key, value.trim());
      }
    });

    const text = query.toString();
    return text ? `?${text}` : '';
  }

  async function loginAdmin() {
    setError(null);
    setMessage(null);
    setBusy('login');

    try {
      const response = await apiFetch<AdminLoginResponse>('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          username: adminUsername,
          password: adminPassword,
        }),
      });

      setAdminToken(response.token);
      setAdminPassword('');
      sessionStorage.setItem('adminToken', response.token);
      await loadAll(response.token);
      setMessage(`后台登录成功，有效期至 ${formatDate(response.expiresAt)}`);
    } catch (caught) {
      showError(caught, '后台登录失败');
    } finally {
      setBusy(null);
    }
  }

  function logoutAdmin() {
    setAdminToken('');
    setSettings(null);
    setOverview(null);
    setSeriesList([]);
    setLocalVideos([]);
    sessionStorage.removeItem('adminToken');
    setMessage('已退出后台');
  }

  async function loadAll(credential = adminCredential) {
    setError(null);
    setBusy('load');

    try {
      const [settingsResponse, overviewResponse, seriesResponse, videosResponse] =
        await Promise.all([
          adminFetch<{ settings: AdminSettings }>(
            '/api/admin/settings',
            credential,
          ),
          adminFetch<Overview>('/api/admin/overview', credential),
          adminFetch<{ series: LocalSeries[] }>('/api/admin/series', credential),
          adminFetch<{ videos: LocalVideo[] }>('/api/admin/videos', credential),
        ]);

      setSettings(settingsResponse.settings);
      setOverview(overviewResponse);
      setSeriesList(seriesResponse.series);
      setLocalVideos(videosResponse.videos);
      setSettingsForm((current) => ({
        ...current,
        telegramPaymentsEnabled:
          settingsResponse.settings.telegramPaymentsEnabled.value || 'false',
        cloudflareAccountId:
          settingsResponse.settings.cloudflareAccountId.value,
        cloudflareCustomerSubdomain:
          settingsResponse.settings.cloudflareCustomerSubdomain.value,
        cloudflareStreamSigningKeyId:
          settingsResponse.settings.cloudflareStreamSigningKeyId.value,
        demoCloudflareVideoUid:
          settingsResponse.settings.demoCloudflareVideoUid.value,
        officialWatermarkText:
          settingsResponse.settings.officialWatermarkText.value || 'Official',
        maxConcurrentPlaySessions:
          settingsResponse.settings.maxConcurrentPlaySessions.value || '1',
      }));
    } catch (caught) {
      if (credential === adminToken) {
        setAdminToken('');
        sessionStorage.removeItem('adminToken');
      }
      showError(caught, '后台载入失败');
    } finally {
      setBusy(null);
    }
  }

  async function refreshTab(tab = activeTab) {
    if (!adminCredential) return;

    setError(null);
    setBusy(`refresh-${tab}`);

    try {
      if (tab === 'overview') {
        setOverview(await adminFetch<Overview>('/api/admin/overview', adminCredential));
      }

      if (tab === 'series') {
        const response = await adminFetch<{ series: LocalSeries[] }>(
          `/api/admin/series${makeQuery({
            q: filters.series,
            status: filters.seriesStatus,
          })}`,
          adminCredential,
        );
        setSeriesList(response.series);
      }

      if (tab === 'videos') {
        const response = await adminFetch<{ videos: LocalVideo[] }>(
          `/api/admin/videos${makeQuery({
            q: filters.videos,
            status: filters.videoStatus,
            seriesId: filters.videoSeriesId,
          })}`,
          adminCredential,
        );
        setLocalVideos(response.videos);
      }

      if (tab === 'orders') {
        const [ordersResponse, rechargesResponse] = await Promise.all([
          adminFetch<{ orders: AdminOrder[] }>(
            `/api/admin/orders${makeQuery({
              q: filters.orders,
              status: filters.orderStatus,
              provider: filters.orderProvider,
            })}`,
            adminCredential,
          ),
          adminFetch<{ recharges: ExternalRecharge[] }>(
            `/api/admin/external-recharges${makeQuery({ q: filters.orders })}`,
            adminCredential,
          ),
        ]);
        setOrders(ordersResponse.orders);
        setExternalRecharges(rechargesResponse.recharges);
      }

      if (tab === 'users') {
        const response = await adminFetch<{ users: AdminUser[] }>(
          `/api/admin/users${makeQuery({ q: filters.users, status: filters.userStatus })}`,
          adminCredential,
        );
        setUsers(response.users);
      }

      if (tab === 'sessions') {
        const response = await adminFetch<{ sessions: PlaySession[] }>(
          `/api/admin/play-sessions${makeQuery({ q: filters.sessions })}`,
          adminCredential,
        );
        setSessions(response.sessions);
      }

      if (tab === 'risk') {
        const response = await adminFetch<{ events: RiskEvent[] }>(
          `/api/admin/risk/events${makeQuery({
            q: filters.risk,
            status: filters.riskStatus,
          })}`,
          adminCredential,
        );
        setRiskEvents(response.events);
      }

      if (tab === 'policies') {
        const response = await adminFetch<{ policies: PolicyDocument[] }>(
          '/api/admin/policies',
          adminCredential,
        );
        setPolicies(response.policies);
      }

      if (tab === 'logs') {
        const response = await adminFetch<{ logs: ActivityLog[] }>(
          `/api/admin/activity-logs${makeQuery({ q: filters.logs })}`,
          adminCredential,
        );
        setLogs(response.logs);
      }
    } catch (caught) {
      showError(caught, '刷新失败');
    } finally {
      setBusy(null);
    }
  }

  async function saveSettings() {
    setError(null);
    setMessage(null);
    setBusy('save-settings');

    try {
      await adminFetch('/api/admin/settings', adminCredential, {
        method: 'PUT',
        body: JSON.stringify(settingsForm),
      });
      await loadAll();
      setSettingsForm((current) => ({
        ...current,
        telegramBotToken: '',
        cloudflareApiToken: '',
        cloudflareStreamSigningPrivateKey: '',
      }));
      setMessage('配置已保存');
    } catch (caught) {
      showError(caught, '保存失败');
    } finally {
      setBusy(null);
    }
  }

  async function testTelegram() {
    setError(null);
    setMessage(null);
    setBusy('telegram');

    try {
      const response = await adminFetch<{ bot: { username?: string } }>(
        '/api/admin/test/telegram',
          adminCredential,
        { method: 'POST' },
      );
      setMessage(`Telegram Bot 连接成功：@${response.bot.username || 'unknown'}`);
    } catch (caught) {
      showError(caught, 'Telegram 测试失败');
    } finally {
      setBusy(null);
    }
  }

  async function testCloudflare() {
    setError(null);
    setMessage(null);
    setBusy('cloudflare');

    try {
      await adminFetch('/api/admin/test/cloudflare', adminCredential, {
        method: 'POST',
      });
      setMessage('Cloudflare Stream 连接成功');
    } catch (caught) {
      showError(caught, 'Cloudflare 测试失败');
    } finally {
      setBusy(null);
    }
  }

  async function generateCloudflareSigningKey() {
    setError(null);
    setMessage(null);
    setBusy('cloudflare-signing-key');

    try {
      const response = await adminFetch<{
        key: { id: string; created: string | null };
      }>('/api/admin/cloudflare/signing-key', adminCredential, {
        method: 'POST',
      });
      await loadAll();
      setSettingsForm((current) => ({
        ...current,
        cloudflareStreamSigningPrivateKey: '',
      }));
      setMessage(`Cloudflare Stream Signing Key 已生成：${response.key.id}`);
    } catch (caught) {
      showError(caught, '生成 Cloudflare Signing Key 失败');
    } finally {
      setBusy(null);
    }
  }

  async function loadCloudflareVideos() {
    setError(null);
    setMessage(null);
    setBusy('cloudflare-videos');

    try {
      const response = await adminFetch<{ videos: CloudflareVideo[] }>(
        '/api/admin/cloudflare/videos',
          adminCredential,
      );
      setCloudflareVideos(response.videos);
      setMessage(`已载入 ${response.videos.length} 个 Cloudflare 视频`);
    } catch (caught) {
      showError(caught, 'Cloudflare 视频载入失败');
    } finally {
      setBusy(null);
    }
  }

  async function uploadCloudflareVideo() {
    if (!cloudflareUploadFile) {
      setError('请选择要上传的视频文件');
      return;
    }

    const title = cloudflareUploadForm.title.trim() || cloudflareUploadFile.name;

    setError(null);
    setMessage(null);
    setCloudflareUploadProgress(0);
    setBusy('cloudflare-upload');

    try {
      const response = await adminFetch<{
        upload: {
          uid: string;
          uploadURL: string;
          title: string;
          requireSignedURLs: boolean;
        };
      }>('/api/admin/cloudflare/direct-upload', adminCredential, {
        method: 'POST',
        body: JSON.stringify({
          title,
          maxDurationSeconds: cloudflareUploadForm.maxDurationSeconds,
          requireSignedURLs: true,
        }),
      });

      await uploadFileToUrl(response.upload.uploadURL, cloudflareUploadFile, (progress) => {
        setCloudflareUploadProgress(progress);
      });

      await adminFetch('/api/admin/videos/import', adminCredential, {
        method: 'POST',
        body: JSON.stringify({
          seriesId: cloudflareUploadForm.seriesId
            ? Number(cloudflareUploadForm.seriesId)
            : null,
          cloudflareVideoUid: response.upload.uid,
          title,
          description: `Cloudflare Stream 上传：${response.upload.uid}`,
          coverImageUrl: cloudflareUploadForm.coverImageUrl.trim() || undefined,
          priceCents: 300,
          priceCredits: creditsFromStars(300),
          currency: 'XTR',
        }),
      });

      setCloudflareUploadForm((current) => ({
        ...current,
        title: '',
        coverImageUrl: '',
      }));
      setCloudflareUploadFile(null);
      setCloudflareUploadProgress(100);
      await Promise.all([refreshTab('videos'), loadCloudflareVideos()]);
      setMessage(`已上传并导入：${title}。Cloudflare 处理中，稍后即可播放。`);
    } catch (caught) {
      showError(caught, 'Cloudflare 上传失败');
    } finally {
      setBusy(null);
    }
  }

  async function importVideo(video: CloudflareVideo) {
    setError(null);
    setMessage(null);
    setBusy(video.uid);

    try {
      await adminFetch('/api/admin/videos/import', adminCredential, {
        method: 'POST',
        body: JSON.stringify({
          seriesId: videoForm.seriesId ? Number(videoForm.seriesId) : null,
          cloudflareVideoUid: video.uid,
          title: video.name,
          description: `Cloudflare Stream: ${video.uid}`,
          coverImageUrl: videoForm.coverImageUrl.trim() || undefined,
          priceCents: 300,
          priceCredits: creditsFromStars(300),
          currency: 'XTR',
        }),
      });
      await refreshTab('videos');
      setMessage(`已导入：${video.name}`);
    } catch (caught) {
      showError(caught, '导入失败');
    } finally {
      setBusy(null);
    }
  }

  function parseBatchImportText() {
    return batchImportText
      .split('\n')
      .map((line, index) => ({ line: line.trim(), index }))
      .filter((item) => item.line && !item.line.startsWith('#'))
      .map(({ line, index }) => {
        const [seriesTitle, title, cloudflareVideoUid, description = '', coverImageUrl = ''] = line
          .split('|')
          .map((item) => item.trim());

        if (!title || !cloudflareVideoUid) {
          throw new Error(`第 ${index + 1} 行格式错误，应为：系列|标题|UID|描述`);
        }

        return {
          seriesTitle: seriesTitle || undefined,
          title,
          cloudflareVideoUid,
          description,
          coverImageUrl: coverImageUrl || undefined,
          priceCents: 300,
          priceCredits: 280,
          status: 'ACTIVE',
        };
      });
  }

  async function batchImportVideos() {
    setError(null);
    setMessage(null);
    setBusy('batch-import');

    try {
      const videos = parseBatchImportText();
      const response = await adminFetch<{
        created: number;
        updated: number;
        seriesCreated: number;
      }>('/api/admin/videos/batch-import', adminCredential, {
        method: 'POST',
        body: JSON.stringify({ videos }),
      });
      setBatchImportText('');
      await Promise.all([refreshTab('videos'), refreshTab('series')]);
      setMessage(
        `批量导入完成：新增 ${response.created}，更新 ${response.updated}，新建系列 ${response.seriesCreated}`,
      );
    } catch (caught) {
      showError(caught, '批量导入失败');
    } finally {
      setBusy(null);
    }
  }

  async function saveSeries() {
    setError(null);
    setMessage(null);
    setBusy('save-series');

    try {
      await adminFetch('/api/admin/series', adminCredential, {
        method: 'POST',
        body: JSON.stringify({
          ...seriesForm,
          sortOrder: Number(seriesForm.sortOrder),
        }),
      });
      setSeriesForm(emptySeriesForm);
      await refreshTab('series');
      setMessage('系列已创建');
    } catch (caught) {
      showError(caught, '系列创建失败');
    } finally {
      setBusy(null);
    }
  }

  function startEditSeries(series: LocalSeries) {
    setEditingSeriesId(series.id);
    setEditSeriesForm({
      title: series.title,
      description: series.description || '',
      slug: series.slug,
      status: series.status,
      sortOrder: String(series.sortOrder),
    });
  }

  async function saveSeriesEdit(series: LocalSeries) {
    setError(null);
    setMessage(null);
    setBusy(`edit-series-${series.id}`);

    try {
      await adminFetch(`/api/admin/series/${series.id}`, adminCredential, {
        method: 'PUT',
        body: JSON.stringify({
          ...editSeriesForm,
          sortOrder: Number(editSeriesForm.sortOrder),
        }),
      });
      setEditingSeriesId(null);
      await Promise.all([refreshTab('series'), refreshTab('videos')]);
      setMessage('系列已保存');
    } catch (caught) {
      showError(caught, '系列保存失败');
    } finally {
      setBusy(null);
    }
  }

  async function updateSeries(series: LocalSeries, status?: LocalSeries['status']) {
    if (status === 'ARCHIVED' && !window.confirm(`确认归档系列「${series.title}」？`)) {
      return;
    }

    setError(null);
    setMessage(null);
    setBusy(`series-${series.id}`);

    try {
      await adminFetch(`/api/admin/series/${series.id}`, adminCredential, {
        method: 'PUT',
        body: JSON.stringify({ status: status || series.status }),
      });
      await refreshTab('series');
      setMessage('系列状态已更新');
    } catch (caught) {
      showError(caught, '系列更新失败');
    } finally {
      setBusy(null);
    }
  }

  async function saveVideo() {
    setError(null);
    setMessage(null);
    setBusy('save-video');

    try {
      await adminFetch('/api/admin/videos', adminCredential, {
        method: 'POST',
        body: JSON.stringify({
          ...videoForm,
          seriesId: videoForm.seriesId ? Number(videoForm.seriesId) : null,
          priceCents: Number(videoForm.priceCents),
          priceCredits: Number(videoForm.priceCredits),
          sortOrder: Number(videoForm.sortOrder),
        }),
      });
      setVideoForm(emptyVideoForm);
      setFilters((current) => ({
        ...current,
        videos: '',
        videoStatus: '',
        videoSeriesId: '',
      }));
      const response = await adminFetch<{ videos: LocalVideo[] }>(
        '/api/admin/videos',
        adminCredential,
      );
      setLocalVideos(response.videos);
      setMessage('视频已创建');
    } catch (caught) {
      showError(caught, '视频创建失败');
    } finally {
      setBusy(null);
    }
  }

  async function updateVideo(video: LocalVideo, status?: LocalVideo['status']) {
    if (status === 'ARCHIVED' && !window.confirm(`确认归档视频「${video.title}」？`)) {
      return;
    }

    setError(null);
    setMessage(null);
    setBusy(`video-${video.id}`);

    try {
      await adminFetch(`/api/admin/videos/${video.id}`, adminCredential, {
        method: 'PUT',
        body: JSON.stringify({ status: status || video.status }),
      });
      await refreshTab('videos');
      setMessage('视频状态已更新');
    } catch (caught) {
      showError(caught, '视频更新失败');
    } finally {
      setBusy(null);
    }
  }

  function startEditVideo(video: LocalVideo) {
    setEditingVideoId(video.id);
    setEditVideoForm({
      seriesId: video.seriesId ? String(video.seriesId) : '',
      title: video.title,
      description: video.description || '',
      coverImageUrl: video.coverImageUrl || '',
      cloudflareVideoUid: video.cloudflareVideoUid,
      priceCents: String(video.priceCents),
      priceCredits: String(video.priceCredits),
      currency: video.currency,
      status: video.status,
      sortOrder: String(video.sortOrder),
    });
  }

  async function saveVideoEdit(video: LocalVideo) {
    setError(null);
    setMessage(null);
    setBusy(`edit-video-${video.id}`);

    try {
      await adminFetch(`/api/admin/videos/${video.id}`, adminCredential, {
        method: 'PUT',
        body: JSON.stringify({
          ...editVideoForm,
          seriesId: editVideoForm.seriesId ? Number(editVideoForm.seriesId) : null,
          priceCents: Number(editVideoForm.priceCents),
          priceCredits: Number(editVideoForm.priceCredits),
          sortOrder: Number(editVideoForm.sortOrder),
        }),
      });
      setEditingVideoId(null);
      await refreshTab('videos');
      setMessage('视频已保存');
    } catch (caught) {
      showError(caught, '视频保存失败');
    } finally {
      setBusy(null);
    }
  }

  async function loadOrderDetail(order: AdminOrder) {
    setError(null);
    setBusy(`order-${order.id}`);

    try {
      const response = await adminFetch<{ order: AdminOrderDetail }>(
        `/api/admin/orders/${order.id}`,
          adminCredential,
      );
      setSelectedOrder(response.order);
    } catch (caught) {
      showError(caught, '订单详情载入失败');
    } finally {
      setBusy(null);
    }
  }

  async function grantOrder(order: AdminOrder) {
    if (!window.confirm(`确认标记订单 ${order.orderCode} 为已支付并发放权限？`)) {
      return;
    }

    setError(null);
    setBusy(`grant-${order.id}`);

    try {
      await adminFetch(`/api/admin/orders/${order.id}/grant`, adminCredential, {
        method: 'POST',
      });
      await refreshTab('orders');
      if (selectedOrder?.id === order.id) {
        await loadOrderDetail(order);
      }
      setMessage(`已发放权限：${order.orderCode}`);
    } catch (caught) {
      showError(caught, '发放权限失败');
    } finally {
      setBusy(null);
    }
  }

  async function changeEntitlement(id: number, action: 'revoke' | 'restore') {
    if (!window.confirm(action === 'revoke' ? '确认撤销这个权限？' : '确认恢复这个权限？')) {
      return;
    }

    setError(null);
    setBusy(`${action}-${id}`);

    try {
      await adminFetch(`/api/admin/entitlements/${id}/${action}`, adminCredential, {
        method: 'POST',
      });
      await refreshTab('orders');
      if (selectedOrder?.entitlement?.id === id) {
        await loadOrderDetail(selectedOrder);
      }
      setMessage(action === 'revoke' ? '权限已撤销' : '权限已恢复');
    } catch (caught) {
      showError(caught, '权限操作失败');
    } finally {
      setBusy(null);
    }
  }

  async function manualGrant() {
    if (!window.confirm('确认手动发放这个视频权限？')) {
      return;
    }

    setError(null);
    setBusy('manual-grant');

    try {
      await adminFetch('/api/admin/grants', adminCredential, {
        method: 'POST',
        body: JSON.stringify({
          telegramUserId: grantForm.telegramUserId,
          username: grantForm.username,
          videoId: grantForm.videoId,
        }),
      });
      setGrantForm((current) => ({
        ...current,
        telegramUserId: '',
        username: '',
        videoId: '',
      }));
      await Promise.all([refreshTab('orders'), refreshTab('users')]);
      setMessage('手动权限已发放');
    } catch (caught) {
      showError(caught, '手动发放失败');
    } finally {
      setBusy(null);
    }
  }

  async function adjustCredits() {
    if (!window.confirm('确认调整这个用户的积分余额？')) {
      return;
    }

    setError(null);
    setBusy('adjust-credits');

    try {
      const response = await adminFetch<{ user: AdminUser }>(
        '/api/admin/credits/adjust',
        adminCredential,
        {
          method: 'POST',
          body: JSON.stringify({
            telegramUserId: grantForm.telegramUserId,
            username: grantForm.username,
            amount: grantForm.creditAmount,
            note: grantForm.creditNote,
          }),
        },
      );
      await refreshTab('users');
      setMessage(`积分已调整，当前余额：${response.user.creditBalance}`);
    } catch (caught) {
      showError(caught, '积分调整失败');
    } finally {
      setBusy(null);
    }
  }

  async function banUser(user: AdminUser) {
    const reason = window.prompt('请输入封禁原因', '录屏或二次转卖风险');

    if (!reason) return;

    setError(null);
    setMessage(null);
    setBusy(`ban-user-${user.id}`);

    try {
      await adminFetch(`/api/admin/users/${user.id}/ban`, adminCredential, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      await refreshTab('users');
      setMessage('用户已封禁');
    } catch (caught) {
      showError(caught, '封禁用户失败');
    } finally {
      setBusy(null);
    }
  }

  async function unbanUser(user: AdminUser) {
    setError(null);
    setMessage(null);
    setBusy(`unban-user-${user.id}`);

    try {
      await adminFetch(`/api/admin/users/${user.id}/unban`, adminCredential, {
        method: 'POST',
      });
      await refreshTab('users');
      setMessage('用户已解封');
    } catch (caught) {
      showError(caught, '解封用户失败');
    } finally {
      setBusy(null);
    }
  }

  async function resolveRiskEvent(event: RiskEvent) {
    setError(null);
    setMessage(null);
    setBusy(`risk-${event.id}`);

    try {
      await adminFetch(`/api/admin/risk/events/${event.id}/resolve`, adminCredential, {
        method: 'POST',
      });
      await refreshTab('risk');
      setMessage('风控事件已处理');
    } catch (caught) {
      showError(caught, '处理风控事件失败');
    } finally {
      setBusy(null);
    }
  }

  async function scanPlaybackRisk() {
    setError(null);
    setMessage(null);
    setBusy('risk-scan');

    try {
      const response = await adminFetch<{ created: number }>(
        '/api/admin/risk/scan-playback',
        adminCredential,
        { method: 'POST' },
      );
      await refreshTab('risk');
      setMessage(`播放异常扫描完成：新增 ${response.created} 个事件`);
    } catch (caught) {
      showError(caught, '播放异常扫描失败');
    } finally {
      setBusy(null);
    }
  }

  async function savePolicy() {
    if (!editingPolicy) return;

    setError(null);
    setMessage(null);
    setBusy(`policy-${editingPolicy.slug}`);

    try {
      await adminFetch(`/api/admin/policies/${editingPolicy.slug}`, adminCredential, {
        method: 'PUT',
        body: JSON.stringify({
          title: editingPolicy.title,
          content: editingPolicy.content,
          status: editingPolicy.status,
        }),
      });
      setEditingPolicy(null);
      await refreshTab('policies');
      setMessage('政策文档已保存');
    } catch (caught) {
      showError(caught, '保存政策文档失败');
    } finally {
      setBusy(null);
    }
  }

  async function loadUserDetail(user: AdminUser) {
    setError(null);
    setBusy(`user-${user.id}`);

    try {
      const response = await adminFetch<{ user: AdminUserDetail }>(
        `/api/admin/users/${user.id}`,
          adminCredential,
      );
      setSelectedUser(response.user);
    } catch (caught) {
      showError(caught, '用户详情载入失败');
    } finally {
      setBusy(null);
    }
  }

  async function loadSessionDetail(session: PlaySession) {
    setError(null);
    setBusy(`session-${session.id}`);

    try {
      const response = await adminFetch<{ session: PlaySessionDetail }>(
        `/api/admin/play-sessions/${session.id}`,
          adminCredential,
      );
      setSelectedSession(response.session);
    } catch (caught) {
      showError(caught, '播放事件载入失败');
    } finally {
      setBusy(null);
    }
  }

  async function createTestUser() {
    setError(null);
    setBusy('dev-user');

    try {
      const response = await adminFetch<{ user: AdminUser }>(
        '/api/admin/dev/test-user',
          adminCredential,
        {
          method: 'POST',
          body: JSON.stringify({
            telegramUserId: devForm.telegramUserId,
            username: devForm.username,
          }),
        },
      );
      setDevForm((current) => ({
        ...current,
        telegramUserId: response.user.telegramUserId,
      }));
      await refreshTab('users');
      setMessage(`测试用户已创建：${response.user.telegramUserId}`);
    } catch (caught) {
      showError(caught, '测试用户创建失败');
    } finally {
      setBusy(null);
    }
  }

  async function createTestOrder() {
    setError(null);
    setBusy('dev-order');

    try {
      const response = await adminFetch<{ order: { orderCode: string } }>(
        '/api/admin/dev/test-order',
          adminCredential,
        {
          method: 'POST',
          body: JSON.stringify({
            telegramUserId: devForm.telegramUserId,
            videoId: devForm.videoId,
            provider: devForm.provider,
            paid: devForm.paid === 'true',
          }),
        },
      );
      setDevForm((current) => ({
        ...current,
        orderCode: response.order.orderCode,
      }));
      await Promise.all([refreshTab('orders'), refreshTab('users')]);
      setMessage(`测试订单已创建：${response.order.orderCode}`);
    } catch (caught) {
      showError(caught, '测试订单创建失败');
    } finally {
      setBusy(null);
    }
  }

  async function simulateTelegramPayment() {
    if (!devForm.orderCode.trim()) {
      setError('请先填写订单号');
      return;
    }

    if (!window.confirm(`确认模拟 Telegram 支付回调：${devForm.orderCode}？`)) {
      return;
    }

    setError(null);
    setBusy('dev-telegram-payment');

    try {
      await adminFetch('/api/admin/dev/simulate-telegram-payment', adminCredential, {
        method: 'POST',
        body: JSON.stringify({
          orderCode: devForm.orderCode,
        }),
      });
      await Promise.all([refreshTab('orders'), refreshTab('logs')]);
      setMessage(`已模拟 Telegram 支付成功：${devForm.orderCode}`);
    } catch (caught) {
      showError(caught, '模拟 Telegram 支付失败');
    } finally {
      setBusy(null);
    }
  }

  async function clearPlaySessions() {
    if (!window.confirm('确认清理所有播放 session 和播放事件？')) {
      return;
    }

    setError(null);
    setBusy('dev-clear-sessions');

    try {
      const response = await adminFetch<{
        deletedEvents: number;
        deletedSessions: number;
      }>('/api/admin/dev/clear-play-sessions', adminCredential, {
        method: 'POST',
      });
      await refreshTab('sessions');
      setSelectedSession(null);
      setMessage(
        `已清理 ${response.deletedSessions} 个 session / ${response.deletedEvents} 个事件`,
      );
    } catch (caught) {
      showError(caught, '清理播放记录失败');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-brand">
          <a href="/" aria-label="TG Video">
            <span className="brand-text">TG Video</span>
          </a>
          <span>运营后台</span>
        </div>
        <div className="admin-actions">
          {isAuthed && (
            <button className="secondary-button" onClick={logoutAdmin}>
              退出
            </button>
          )}
          <a className="admin-link" href="/">
            返回前台
          </a>
        </div>
      </header>

      <section className="admin-panel">
        <h2>管理员登录</h2>
        {isAuthed ? (
          <div className="admin-row">
            <p className="muted-text">当前后台会话已登录。</p>
            <button
              className="secondary-button"
              disabled={busy === 'load'}
              onClick={() => void loadAll()}
            >
              {busy === 'load' ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
              <span>刷新</span>
            </button>
          </div>
        ) : (
          <div className="admin-row">
            <label>
              <span>管理员用户名</span>
              <input
                value={adminUsername}
                onChange={(event) => setAdminUsername(event.target.value)}
                placeholder="默认 admin"
              />
            </label>
            <label>
              <span>管理员密码</span>
              <input
                value={adminPassword}
                type="password"
                onChange={(event) => setAdminPassword(event.target.value)}
                placeholder="默认 admin123"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && adminUsername && adminPassword) {
                    void loginAdmin();
                  }
                }}
              />
            </label>
            <button
              className="primary-button"
              disabled={!adminUsername || !adminPassword || busy === 'login'}
              onClick={() => void loginAdmin()}
            >
              {busy === 'login' ? <Loader2 className="spin" size={18} /> : <Shield size={18} />}
              <span>进入</span>
            </button>
          </div>
        )}
      </section>

      {isAuthed && (
        <>
          <nav className="admin-tabs" aria-label="后台功能">
            {tabs.map((tab) => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.key}
                  className={activeTab === tab.key ? 'admin-tab active' : 'admin-tab'}
                  onClick={() => {
                    setActiveTab(tab.key);
                    void refreshTab(tab.key);
                  }}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {activeTab === 'overview' && overview && (
            <section className="admin-panel">
              <PanelTitle title="概览" onRefresh={() => void refreshTab('overview')} />
              <div className="stat-grid">
                <StatCard label="用户" value={overview.stats.userCount} />
                <StatCard label="系列" value={overview.stats.seriesCount} />
                <StatCard label="视频" value={overview.stats.videoCount} />
                <StatCard label="上架视频" value={overview.stats.activeVideoCount} />
                <StatCard label="订单" value={overview.stats.orderCount} />
                <StatCard label="已支付" value={overview.stats.paidOrderCount} />
                <StatCard label="有效权限" value={overview.stats.activeEntitlementCount} />
                <StatCard label="播放会话" value={overview.stats.playSessionCount} />
                <StatCard label="待处理风控" value={overview.stats.openRiskEventCount} />
                <StatCard label="封禁用户" value={overview.stats.bannedUserCount} />
              </div>
              <section className="chart-panel">
                <div className="panel-title-row">
                  <h2>近 7 天趋势</h2>
                  <BarChart3 size={20} />
                </div>
                <div className="metric-bars">
                  {overview.dailyMetrics.map((metric) => {
                    const maxValue = Math.max(
                      ...overview.dailyMetrics.map((item) =>
                        Math.max(item.orders, item.playSessions, item.riskEvents, 1),
                      ),
                    );

                    return (
                      <div className="metric-day" key={metric.date}>
                        <span>{metric.date.slice(5)}</span>
                        <div className="metric-bar-stack">
                          <i style={{ height: `${Math.max(8, (metric.orders / maxValue) * 100)}%` }} title={`订单 ${metric.orders}`} />
                          <i style={{ height: `${Math.max(8, (metric.playSessions / maxValue) * 100)}%` }} title={`播放 ${metric.playSessions}`} />
                          <i style={{ height: `${Math.max(8, (metric.riskEvents / maxValue) * 100)}%` }} title={`风控 ${metric.riskEvents}`} />
                        </div>
                        <small>订{metric.orders} 播{metric.playSessions} 风{metric.riskEvents}</small>
                      </div>
                    );
                  })}
                </div>
                <p className="muted-line">橙色=订单，绿色=播放，红色=风控事件。</p>
              </section>
              <DataTable
                headers={['订单号', '视频', '用户', '状态', '金额']}
                rows={overview.recentOrders.map((order) => [
                  order.orderCode,
                  order.video.title,
                  order.user.username || order.user.telegramUserId,
                  order.status,
                  formatMoney(order.amountCents, order.currency),
                ])}
              />
            </section>
          )}

          {activeTab === 'settings' && settings && (
            <SettingsPanel
              settings={settings}
              form={settingsForm}
              busy={busy}
              onChange={(key, value) =>
                setSettingsForm((current) => ({ ...current, [key]: value }))
              }
              onSave={saveSettings}
              onTestTelegram={testTelegram}
              onTestCloudflare={testCloudflare}
              onGenerateCloudflareSigningKey={generateCloudflareSigningKey}
            />
          )}

          {activeTab === 'payments' && settings && (
            <PaymentsPanel
              form={settingsForm}
              busy={busy}
              onChange={(key, value) =>
                setSettingsForm((current) => ({ ...current, [key]: value }))
              }
              onSave={saveSettings}
            />
          )}

          {activeTab === 'series' && (
            <section className="admin-panel">
              <PanelTitle title="系列管理" onRefresh={() => void refreshTab('series')} />
              <div className="filter-row">
                <input
                  value={filters.series}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      series: event.target.value,
                    }))
                  }
                  placeholder="搜索系列标题或 slug"
                />
                <select
                  value={filters.seriesStatus}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      seriesStatus: event.target.value,
                    }))
                  }
                >
                  <option value="">全部状态</option>
                  <option value="ACTIVE">上架</option>
                  <option value="DRAFT">草稿</option>
                  <option value="ARCHIVED">归档</option>
                </select>
                <button className="secondary-button" onClick={() => void refreshTab('series')}>
                  筛选
                </button>
              </div>
              <div className="admin-grid">
                <label>
                  <span>系列标题</span>
                  <input
                    value={seriesForm.title}
                    onChange={(event) =>
                      setSeriesForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Slug</span>
                  <input
                    value={seriesForm.slug}
                    onChange={(event) =>
                      setSeriesForm((current) => ({
                        ...current,
                        slug: event.target.value,
                      }))
                    }
                    placeholder="留空自动生成"
                  />
                </label>
                <label>
                  <span>排序</span>
                  <input
                    value={seriesForm.sortOrder}
                    onChange={(event) =>
                      setSeriesForm((current) => ({
                        ...current,
                        sortOrder: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>状态</span>
                  <select
                    value={seriesForm.status}
                    onChange={(event) =>
                      setSeriesForm((current) => ({
                        ...current,
                        status: event.target.value,
                      }))
                    }
                  >
                    <option value="ACTIVE">上架</option>
                    <option value="DRAFT">草稿</option>
                    <option value="ARCHIVED">归档</option>
                  </select>
                </label>
                <label className="wide-field">
                  <span>描述</span>
                  <textarea
                    value={seriesForm.description}
                    onChange={(event) =>
                      setSeriesForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    rows={3}
                  />
                </label>
              </div>
              <button
                className="primary-button"
                disabled={busy === 'save-series'}
                onClick={() => void saveSeries()}
              >
                {busy === 'save-series' ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                <span>新建系列</span>
              </button>

              <div className="admin-video-list">
                {seriesList.map((series) => (
                  <article className="admin-video-item" key={series.id}>
                    <div>
                      <strong>{series.title}</strong>
                      <span>{series.slug}</span>
                      <small>
                        {series.status} · 排序 {series.sortOrder} · 视频 {series.counts.videos}
                      </small>
                    </div>
                    <div className="item-actions">
                      <button
                        className="secondary-button"
                        disabled={busy === `series-${series.id}`}
                        onClick={() => startEditSeries(series)}
                      >
                        编辑
                      </button>
                      <button
                        className="secondary-button"
                        disabled={busy === `series-${series.id}`}
                        onClick={() =>
                          void updateSeries(
                            series,
                            series.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE',
                          )
                        }
                      >
                        {series.status === 'ACTIVE' ? '下架' : '上架'}
                      </button>
                      <button
                        className="secondary-button danger"
                        disabled={busy === `series-${series.id}`}
                        onClick={() => void updateSeries(series, 'ARCHIVED')}
                      >
                        归档
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'videos' && (
            <section className="admin-panel">
              <PanelTitle title="视频管理" onRefresh={() => void refreshTab('videos')} />
              <div className="filter-row">
                <input
                  value={filters.videos}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      videos: event.target.value,
                    }))
                  }
                  placeholder="搜索标题或 UID"
                />
                <select
                  value={filters.videoStatus}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      videoStatus: event.target.value,
                    }))
                  }
                >
                  <option value="">全部状态</option>
                  <option value="ACTIVE">上架</option>
                  <option value="DRAFT">草稿</option>
                  <option value="ARCHIVED">归档</option>
                </select>
                <select
                  value={filters.videoSeriesId}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      videoSeriesId: event.target.value,
                    }))
                  }
                >
                  <option value="">全部系列</option>
                  {seriesList.map((series) => (
                    <option key={series.id} value={series.id}>
                      {series.title}
                    </option>
                  ))}
                </select>
                <button className="secondary-button" onClick={() => void refreshTab('videos')}>
                  筛选
                </button>
              </div>
              <div className="admin-grid">
                <label>
                  <span>所属系列</span>
                  <select
                    value={videoForm.seriesId}
                    onChange={(event) =>
                      setVideoForm((current) => ({
                        ...current,
                        seriesId: event.target.value,
                      }))
                    }
                  >
                    <option value="">未分组</option>
                    {seriesList.map((series) => (
                      <option key={series.id} value={series.id}>
                        {series.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>标题</span>
                  <input
                    value={videoForm.title}
                    onChange={(event) =>
                      setVideoForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Cloudflare Video UID</span>
                  <input
                    value={videoForm.cloudflareVideoUid}
                    onChange={(event) =>
                      setVideoForm((current) => ({
                        ...current,
                        cloudflareVideoUid: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>封面 URL</span>
                  <input
                    value={videoForm.coverImageUrl}
                    onChange={(event) =>
                      setVideoForm((current) => ({
                        ...current,
                        coverImageUrl: event.target.value,
                      }))
                    }
                    placeholder="/assets/covers/example.jpg 或 https://..."
                  />
                </label>
                <label>
                  <span>Stars 价格</span>
                  <input
                    value={videoForm.priceCents}
                    onChange={(event) =>
                      setVideoForm((current) => ({
                        ...current,
                        priceCents: event.target.value,
                        priceCredits: creditsFromStars(event.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  <span>积分价格</span>
                  <input
                    value={videoForm.priceCredits}
                    onChange={(event) =>
                      setVideoForm((current) => ({
                        ...current,
                        priceCredits: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>排序</span>
                  <input
                    value={videoForm.sortOrder}
                    onChange={(event) =>
                      setVideoForm((current) => ({
                        ...current,
                        sortOrder: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>状态</span>
                  <select
                    value={videoForm.status}
                    onChange={(event) =>
                      setVideoForm((current) => ({
                        ...current,
                        status: event.target.value,
                      }))
                    }
                  >
                    <option value="ACTIVE">上架</option>
                    <option value="DRAFT">草稿</option>
                    <option value="ARCHIVED">归档</option>
                  </select>
                </label>
                <label className="wide-field">
                  <span>描述</span>
                  <textarea
                    value={videoForm.description}
                    onChange={(event) =>
                      setVideoForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    rows={3}
                  />
                </label>
              </div>
              <button
                className="primary-button"
                disabled={busy === 'save-video'}
                onClick={() => void saveVideo()}
              >
                {busy === 'save-video' ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                <span>新建视频</span>
              </button>

              <div className="admin-video-list">
                {localVideos.length === 0 && (
                  <div className="admin-empty-state">
                    当前筛选条件下没有视频。新建视频后会显示在这里，也可以切换为“全部状态 / 全部系列”再筛选。
                  </div>
                )}
                {localVideos.map((video) => (
                  <article className="admin-video-item" key={video.id}>
                    <div>
                      <strong>{video.title}</strong>
                      <span>{video.series?.title || '未分组'} · {video.cloudflareVideoUid}</span>
                      <small>
                        {video.status} · {formatMoney(video.priceCents, video.currency)}
                        或 {video.priceCredits}积分
                        · 排序 {video.sortOrder} · 订单 {video.counts.orders} · 播放 {video.counts.playSessions}
                      </small>
                    </div>
                    <div className="item-actions">
                      <button
                        className="secondary-button"
                        disabled={busy === `video-${video.id}`}
                        onClick={() => startEditVideo(video)}
                      >
                        编辑
                      </button>
                      <button
                        className="secondary-button"
                        disabled={busy === `video-${video.id}`}
                        onClick={() =>
                          void updateVideo(
                            video,
                            video.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE',
                          )
                        }
                      >
                        {video.status === 'ACTIVE' ? '下架' : '上架'}
                      </button>
                      <button
                        className="secondary-button danger"
                        disabled={busy === `video-${video.id}`}
                        onClick={() => void updateVideo(video, 'ARCHIVED')}
                      >
                        归档
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'cloudflare' && (
            <section className="admin-panel">
              <PanelTitle title="Cloudflare 视频导入" onRefresh={loadCloudflareVideos} />
              <div className="batch-import-box">
                <div className="panel-title-row">
                  <h2>上传到 Cloudflare Stream</h2>
                  <span className="muted-text">默认启用 signed playback</span>
                </div>
                <div className="admin-grid">
                  <label>
                    <span>视频标题</span>
                    <input
                      value={cloudflareUploadForm.title}
                      onChange={(event) =>
                        setCloudflareUploadForm((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder="留空则使用文件名"
                    />
                  </label>
                  <label>
                    <span>封面 URL</span>
                    <input
                      value={cloudflareUploadForm.coverImageUrl}
                      onChange={(event) =>
                        setCloudflareUploadForm((current) => ({
                          ...current,
                          coverImageUrl: event.target.value,
                        }))
                      }
                      placeholder="/assets/covers/example.jpg 或 https://..."
                    />
                  </label>
                  <label>
                    <span>所属系列</span>
                    <select
                      value={cloudflareUploadForm.seriesId}
                      onChange={(event) =>
                        setCloudflareUploadForm((current) => ({
                          ...current,
                          seriesId: event.target.value,
                        }))
                      }
                    >
                      <option value="">未分组</option>
                      {seriesList.map((series) => (
                        <option key={series.id} value={series.id}>
                          {series.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>最长时长秒数</span>
                    <input
                      value={cloudflareUploadForm.maxDurationSeconds}
                      onChange={(event) =>
                        setCloudflareUploadForm((current) => ({
                          ...current,
                          maxDurationSeconds: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>视频文件</span>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(event) =>
                        setCloudflareUploadFile(event.target.files?.[0] || null)
                      }
                    />
                  </label>
                </div>
                {busy === 'cloudflare-upload' && (
                  <div className="upload-progress">
                    <span style={{ width: `${cloudflareUploadProgress}%` }} />
                  </div>
                )}
                <button
                  className="primary-button"
                  disabled={busy === 'cloudflare-upload' || !cloudflareUploadFile}
                  onClick={() => void uploadCloudflareVideo()}
                >
                  {busy === 'cloudflare-upload' ? (
                    <Loader2 className="spin" size={18} />
                  ) : (
                    <UploadCloud size={18} />
                  )}
                  <span>
                    {busy === 'cloudflare-upload'
                      ? `上传中 ${cloudflareUploadProgress}%`
                      : '上传并导入'}
                  </span>
                </button>
                <p className="muted-line">
                  上传文件直接进入 Cloudflare Stream，不经过本项目服务器。上传完成后会自动写入本地视频库，价格默认 300Stars 或 280积分。
                </p>
              </div>
              <div className="batch-import-box">
                <label className="wide-field">
                  <span>批量导入</span>
                  <textarea
                    value={batchImportText}
                    onChange={(event) => setBatchImportText(event.target.value)}
                    rows={6}
                    placeholder={'每行一个视频：系列|标题|Cloudflare UID|描述|封面URL\n示例系列 01|第 01 集|video_uid_001|可选描述|/assets/covers/example.jpg'}
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={busy === 'batch-import' || !batchImportText.trim()}
                  onClick={() => void batchImportVideos()}
                >
                  {busy === 'batch-import' ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />}
                  <span>批量导入</span>
                </button>
              </div>
              <div className="admin-video-list">
                {cloudflareVideos.map((video) => (
                  <article className="admin-video-item" key={video.uid}>
                    <div>
                      <strong>{video.name}</strong>
                      <span>{video.uid}</span>
                      {video.state && <small>{video.state}</small>}
                    </div>
                    <button
                      className="secondary-button"
                      disabled={busy === video.uid}
                      onClick={() => void importVideo(video)}
                    >
                      {busy === video.uid ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />}
                      <span>导入</span>
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'orders' && (
            <section className="admin-panel">
              <PanelTitle title="订单和权限" onRefresh={() => void refreshTab('orders')} />
              <div className="filter-row">
                <input
                  value={filters.orders}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      orders: event.target.value,
                    }))
                  }
                  placeholder="订单号 / 用户 / 视频"
                />
                <select
                  value={filters.orderStatus}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      orderStatus: event.target.value,
                    }))
                  }
                >
                  <option value="">全部状态</option>
                  <option value="PENDING">待支付</option>
                  <option value="PAID">已支付</option>
                  <option value="CANCELLED">已取消</option>
                  <option value="REFUNDED">已退款</option>
                </select>
                <select
                  value={filters.orderProvider}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      orderProvider: event.target.value,
                    }))
                  }
                >
                  <option value="">全部支付方式</option>
                  <option value="telegram_stars">Telegram Stars</option>
                  <option value="project_credits">项目积分</option>
                  <option value="admin">后台发放</option>
                </select>
                <button className="secondary-button" onClick={() => void refreshTab('orders')}>
                  筛选
                </button>
              </div>
              <div className="admin-grid">
                <label>
                  <span>Telegram User ID</span>
                  <input
                    value={grantForm.telegramUserId}
                    onChange={(event) =>
                      setGrantForm((current) => ({
                        ...current,
                        telegramUserId: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>用户名</span>
                  <input
                    value={grantForm.username}
                    onChange={(event) =>
                      setGrantForm((current) => ({
                        ...current,
                        username: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>视频</span>
                  <select
                    value={grantForm.videoId}
                    onChange={(event) =>
                      setGrantForm((current) => ({
                        ...current,
                        videoId: event.target.value,
                      }))
                    }
                  >
                    <option value="">选择视频</option>
                    {activeVideos.map((video) => (
                      <option key={video.id} value={video.id}>
                        {video.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                className="primary-button"
                disabled={busy === 'manual-grant'}
                onClick={() => void manualGrant()}
              >
                <Shield size={18} />
                <span>手动发放权限</span>
              </button>

              <div className="admin-grid">
                <label>
                  <span>积分调整数量</span>
                  <input
                    value={grantForm.creditAmount}
                    onChange={(event) =>
                      setGrantForm((current) => ({
                        ...current,
                        creditAmount: event.target.value,
                      }))
                    }
                    placeholder="正数增加，负数扣减"
                  />
                </label>
                <label className="wide-field">
                  <span>积分备注</span>
                  <input
                    value={grantForm.creditNote}
                    onChange={(event) =>
                      setGrantForm((current) => ({
                        ...current,
                        creditNote: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <button
                className="secondary-button"
                disabled={busy === 'adjust-credits'}
                onClick={() => void adjustCredits()}
              >
                <CreditCard size={18} />
                <span>调整积分</span>
              </button>

              <div className="admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>订单</th>
                      <th>视频</th>
                      <th>用户</th>
                      <th>支付方式</th>
                      <th>金额</th>
                      <th>状态</th>
                      <th>权限</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td>{order.orderCode}</td>
                        <td>{order.video.title}</td>
                        <td>{order.user.username || order.user.telegramUserId}</td>
                        <td>{formatPaymentProvider(order.provider)}</td>
                        <td>{formatMoney(order.amountCents, order.currency)}</td>
                        <td>{order.status}</td>
                        <td>{order.entitlement?.status || '无'}</td>
                        <td>
                          <div className="table-actions">
                            {order.status !== 'PAID' && (
                              <button onClick={() => void grantOrder(order)}>
                                标记支付
                              </button>
                            )}
                            <button onClick={() => void loadOrderDetail(order)}>
                              详情
                            </button>
                            {order.entitlement?.status === 'ACTIVE' && (
                              <button
                                onClick={() =>
                                  void changeEntitlement(
                                    order.entitlement!.id,
                                    'revoke',
                                  )
                                }
                              >
                                撤销
                              </button>
                            )}
                            {order.entitlement?.status === 'REVOKED' && (
                              <button
                                onClick={() =>
                                  void changeEntitlement(
                                    order.entitlement!.id,
                                    'restore',
                                  )
                                }
                              >
                                恢复
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <section className="sub-panel">
                <div className="panel-title-row">
                  <h2>外部服务端充值记录</h2>
                  <span className="muted-text">
                    对接流程：查账号 /api/external/users/lookup，收款成功后调用
                    /api/external/credits/recharge
                  </span>
                </div>
                <p className="muted-text">
                  外部服务端使用 x-external-recharge-secret 调用；创建外部订单时锁定
                  telegramUserId，到账时按锁定账号入账。
                </p>
                <DataTable
                  headers={['Request ID', '用户', '渠道', '积分', '状态', '到账时间']}
                  rows={externalRecharges.map((recharge) => [
                    recharge.requestId,
                    recharge.user.username || recharge.user.telegramUserId,
                    recharge.provider,
                    recharge.amount,
                    recharge.status,
                    recharge.creditedAt ? formatDate(recharge.creditedAt) : '-',
                  ])}
                />
              </section>
              {selectedOrder && (
                <AdminModal title={`订单详情 ${selectedOrder.orderCode}`} onClose={() => setSelectedOrder(null)}>
                  <OrderDetailPanel order={selectedOrder} />
                </AdminModal>
              )}
            </section>
          )}

          {activeTab === 'users' && (
            <section className="admin-panel">
              <PanelTitle title="用户" onRefresh={() => void refreshTab('users')} />
              <div className="filter-row">
                <input
                  value={filters.users}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      users: event.target.value,
                    }))
                  }
                  placeholder="Telegram ID / 用户名"
                />
                <select
                  value={filters.userStatus}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      userStatus: event.target.value,
                    }))
                  }
                >
                  <option value="">全部用户</option>
                  <option value="BANNED">仅封禁</option>
                </select>
                <button className="secondary-button" onClick={() => void refreshTab('users')}>
                  筛选
                </button>
              </div>
              <div className="admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>Telegram ID</th>
                      <th>用户名</th>
                      <th>状态</th>
                      <th>风险分</th>
                      <th>积分</th>
                      <th>订单</th>
                      <th>权限</th>
                      <th>播放</th>
                      <th>创建时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td>{user.telegramUserId}</td>
                        <td>{user.username || user.firstName || '-'}</td>
                        <td>{user.status}</td>
                        <td>{user.riskScore}</td>
                        <td>{user.creditBalance}</td>
                        <td>{user.counts.orders}</td>
                        <td>{user.counts.entitlements}</td>
                        <td>{user.counts.playSessions}</td>
                        <td>{formatDate(user.createdAt)}</td>
                        <td>
                          <div className="table-actions">
                            <button onClick={() => void loadUserDetail(user)}>
                              详情
                            </button>
                            {user.status === 'BANNED' ? (
                              <button onClick={() => void unbanUser(user)}>
                                解封
                              </button>
                            ) : (
                              <button onClick={() => void banUser(user)}>
                                封禁
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedUser && (
                <UserDetailPanel
                  user={selectedUser}
                  onClose={() => setSelectedUser(null)}
                />
              )}
            </section>
          )}

          {activeTab === 'sessions' && (
            <section className="admin-panel">
              <PanelTitle title="播放记录" onRefresh={() => void refreshTab('sessions')} />
              <div className="filter-row">
                <input
                  value={filters.sessions}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      sessions: event.target.value,
                    }))
                  }
                  placeholder="Session / 订单号 / 用户 / 视频 / IP"
                />
                <button className="secondary-button" onClick={() => void refreshTab('sessions')}>
                  筛选
                </button>
              </div>
              <div className="admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>Session</th>
                      <th>订单</th>
                      <th>视频</th>
                      <th>用户</th>
                      <th>IP</th>
                      <th>事件</th>
                      <th>最后心跳</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr key={session.id}>
                        <td>{session.sessionCode}</td>
                        <td>{session.order.orderCode}</td>
                        <td>{session.video.title}</td>
                        <td>{session.user.username || session.user.telegramUserId}</td>
                        <td>{session.ipAddress || '-'}</td>
                        <td>{session.eventCount}</td>
                        <td>{session.lastSeenAt ? formatDate(session.lastSeenAt) : '-'}</td>
                        <td>
                          <div className="table-actions">
                            <button onClick={() => void loadSessionDetail(session)}>
                              事件
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedSession && (
                <SessionDetailPanel
                  session={selectedSession}
                  onClose={() => setSelectedSession(null)}
                />
              )}
            </section>
          )}

          {activeTab === 'risk' && (
            <section className="admin-panel">
              <PanelTitle title="风控与播放异常" onRefresh={() => void refreshTab('risk')} />
              <div className="filter-row">
                <input
                  value={filters.risk}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      risk: event.target.value,
                    }))
                  }
                  placeholder="类型 / 消息 / 用户"
                />
                <select
                  value={filters.riskStatus}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      riskStatus: event.target.value,
                    }))
                  }
                >
                  <option value="">全部状态</option>
                  <option value="OPEN">待处理</option>
                  <option value="RESOLVED">已处理</option>
                </select>
                <button className="secondary-button" onClick={() => void refreshTab('risk')}>
                  筛选
                </button>
                <button
                  className="secondary-button"
                  disabled={busy === 'risk-scan'}
                  onClick={() => void scanPlaybackRisk()}
                >
                  <AlertTriangle size={16} />
                  <span>扫描播放异常</span>
                </button>
              </div>
              <DataTable
                headers={['时间', '类型', '等级', '状态', '用户', '视频/订单', '说明', '操作']}
                rows={riskEvents.map((event) => [
                  formatDate(event.createdAt),
                  event.type,
                  event.severity,
                  event.status,
                  event.user?.username || event.user?.telegramUserId || '-',
                  event.playSession
                    ? `${event.playSession.video.title} / ${event.playSession.order.orderCode}`
                    : '-',
                  event.message,
                  event.status === 'OPEN' ? (
                    <button onClick={() => void resolveRiskEvent(event)}>处理</button>
                  ) : '-',
                ])}
              />
            </section>
          )}

          {activeTab === 'policies' && (
            <section className="admin-panel">
              <PanelTitle title="协议与规则" onRefresh={() => void refreshTab('policies')} />
              <DataTable
                headers={['页面', 'Slug', '状态', '更新时间', '操作']}
                rows={policies.map((policy) => [
                  policy.title,
                  policy.slug,
                  policy.status,
                  formatDate(policy.updatedAt),
                  <button onClick={() => setEditingPolicy(policy)}>编辑</button>,
                ])}
              />
              <p className="muted-line">
                已准备用户协议、退款说明、封号规则和版权声明。退款说明当前按“不提供退款服务”策略撰写。
              </p>
            </section>
          )}

          {activeTab === 'logs' && (
            <section className="admin-panel">
              <PanelTitle title="活动日志" onRefresh={() => void refreshTab('logs')} />
              <div className="filter-row">
                <input
                  value={filters.logs}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      logs: event.target.value,
                    }))
                  }
                  placeholder="动作 / 对象 / 消息"
                />
                <button className="secondary-button" onClick={() => void refreshTab('logs')}>
                  筛选
                </button>
              </div>
              <DataTable
                headers={['时间', '动作', '对象', '操作者', '消息', 'IP']}
                rows={logs.map((log) => [
                  formatDate(log.createdAt),
                  log.action,
                  `${log.entityType}${log.entityId ? `#${log.entityId}` : ''}`,
                  log.actorId || log.actorType,
                  log.message,
                  log.ipAddress || '-',
                ])}
              />
            </section>
          )}

          {activeTab === 'devtools' && (
            <section className="admin-panel">
              <PanelTitle title="开发工具" onRefresh={() => void refreshTab('devtools')} />
              <div className="admin-grid">
                <label>
                  <span>测试 Telegram User ID</span>
                  <input
                    value={devForm.telegramUserId}
                    onChange={(event) =>
                      setDevForm((current) => ({
                        ...current,
                        telegramUserId: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>测试用户名</span>
                  <input
                    value={devForm.username}
                    onChange={(event) =>
                      setDevForm((current) => ({
                        ...current,
                        username: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>视频</span>
                  <select
                    value={devForm.videoId}
                    onChange={(event) =>
                      setDevForm((current) => ({
                        ...current,
                        videoId: event.target.value,
                      }))
                    }
                  >
                    <option value="">选择视频</option>
                    {localVideos.map((video) => (
                      <option key={video.id} value={video.id}>
                        {video.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>支付方式</span>
                  <select
                    value={devForm.provider}
                    onChange={(event) =>
                      setDevForm((current) => ({
                        ...current,
                        provider: event.target.value,
                      }))
                    }
                  >
                    <option value="telegram_stars">Telegram Stars</option>
                    <option value="admin">后台发放</option>
                  </select>
                </label>
                <label>
                  <span>订单状态</span>
                  <select
                    value={devForm.paid}
                    onChange={(event) =>
                      setDevForm((current) => ({
                        ...current,
                        paid: event.target.value,
                      }))
                    }
                  >
                    <option value="false">待支付</option>
                    <option value="true">已支付并授权</option>
                  </select>
                </label>
                <label>
                  <span>模拟回调订单号</span>
                  <input
                    value={devForm.orderCode}
                    onChange={(event) =>
                      setDevForm((current) => ({
                        ...current,
                        orderCode: event.target.value,
                      }))
                    }
                    placeholder="创建测试订单后自动填入"
                  />
                </label>
              </div>
              <section className="admin-actions">
                <button className="primary-button" onClick={() => void createTestUser()}>
                  创建测试用户
                </button>
                <button className="secondary-button" onClick={() => void createTestOrder()}>
                  创建测试订单
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void simulateTelegramPayment()}
                >
                  模拟 Telegram 支付
                </button>
                <button className="secondary-button danger" onClick={() => void clearPlaySessions()}>
                  清理播放记录
                </button>
              </section>
            </section>
          )}
        </>
      )}

      {editingSeries && (
        <AdminModal title={`编辑系列：${editingSeries.title}`} onClose={() => setEditingSeriesId(null)}>
          <div className="admin-modal-form">
            <label>
              <span>系列标题</span>
              <input
                value={editSeriesForm.title}
                onChange={(event) =>
                  setEditSeriesForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Slug</span>
              <input
                value={editSeriesForm.slug}
                onChange={(event) =>
                  setEditSeriesForm((current) => ({
                    ...current,
                    slug: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>排序</span>
              <input
                value={editSeriesForm.sortOrder}
                onChange={(event) =>
                  setEditSeriesForm((current) => ({
                    ...current,
                    sortOrder: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>状态</span>
              <select
                value={editSeriesForm.status}
                onChange={(event) =>
                  setEditSeriesForm((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
              >
                <option value="ACTIVE">上架</option>
                <option value="DRAFT">草稿</option>
                <option value="ARCHIVED">归档</option>
              </select>
            </label>
            <label className="wide-field">
              <span>描述</span>
              <textarea
                value={editSeriesForm.description}
                onChange={(event) =>
                  setEditSeriesForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
              />
            </label>
            <div className="admin-modal-actions">
              <button
                className="primary-button"
                disabled={busy === `edit-series-${editingSeries.id}`}
                onClick={() => void saveSeriesEdit(editingSeries)}
              >
                {busy === `edit-series-${editingSeries.id}` ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                <span>保存</span>
              </button>
              <button className="secondary-button" onClick={() => setEditingSeriesId(null)}>
                取消
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      {editingVideo && (
        <AdminModal title={`编辑视频：${editingVideo.title}`} onClose={() => setEditingVideoId(null)}>
          <div className="admin-modal-form">
            <label>
              <span>所属系列</span>
              <select
                value={editVideoForm.seriesId}
                onChange={(event) =>
                  setEditVideoForm((current) => ({
                    ...current,
                    seriesId: event.target.value,
                  }))
                }
              >
                <option value="">未分组</option>
                {seriesList.map((series) => (
                  <option key={series.id} value={series.id}>
                    {series.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>标题</span>
              <input
                value={editVideoForm.title}
                onChange={(event) =>
                  setEditVideoForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Cloudflare Video UID</span>
              <input
                value={editVideoForm.cloudflareVideoUid}
                onChange={(event) =>
                  setEditVideoForm((current) => ({
                    ...current,
                    cloudflareVideoUid: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>封面 URL</span>
              <input
                value={editVideoForm.coverImageUrl}
                onChange={(event) =>
                  setEditVideoForm((current) => ({
                    ...current,
                    coverImageUrl: event.target.value,
                  }))
                }
                placeholder="/assets/covers/example.jpg 或 https://..."
              />
            </label>
            <label>
              <span>Stars 价格</span>
              <input
                value={editVideoForm.priceCents}
                onChange={(event) =>
                  setEditVideoForm((current) => ({
                    ...current,
                    priceCents: event.target.value,
                    priceCredits: creditsFromStars(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              <span>积分价格</span>
              <input
                value={editVideoForm.priceCredits}
                onChange={(event) =>
                  setEditVideoForm((current) => ({
                    ...current,
                    priceCredits: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>币种</span>
              <input
                value={editVideoForm.currency}
                onChange={(event) =>
                  setEditVideoForm((current) => ({
                    ...current,
                    currency: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>排序</span>
              <input
                value={editVideoForm.sortOrder}
                onChange={(event) =>
                  setEditVideoForm((current) => ({
                    ...current,
                    sortOrder: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>状态</span>
              <select
                value={editVideoForm.status}
                onChange={(event) =>
                  setEditVideoForm((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
              >
                <option value="ACTIVE">上架</option>
                <option value="DRAFT">草稿</option>
                <option value="ARCHIVED">归档</option>
              </select>
            </label>
            <label className="wide-field">
              <span>描述</span>
              <textarea
                value={editVideoForm.description}
                onChange={(event) =>
                  setEditVideoForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
              />
            </label>
            <div className="admin-modal-actions">
              <button
                className="primary-button"
                disabled={busy === `edit-video-${editingVideo.id}`}
                onClick={() => void saveVideoEdit(editingVideo)}
              >
                {busy === `edit-video-${editingVideo.id}` ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                <span>保存</span>
              </button>
              <button className="secondary-button" onClick={() => setEditingVideoId(null)}>
                取消
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      {editingPolicy && (
        <AdminModal title={`编辑政策：${editingPolicy.title}`} onClose={() => setEditingPolicy(null)}>
          <div className="admin-modal-form">
            <label>
              <span>标题</span>
              <input
                value={editingPolicy.title}
                onChange={(event) =>
                  setEditingPolicy((current) =>
                    current ? { ...current, title: event.target.value } : current,
                  )
                }
              />
            </label>
            <label>
              <span>状态</span>
              <select
                value={editingPolicy.status}
                onChange={(event) =>
                  setEditingPolicy((current) =>
                    current
                      ? { ...current, status: event.target.value as PolicyDocument['status'] }
                      : current,
                  )
                }
              >
                <option value="PUBLISHED">发布</option>
                <option value="DRAFT">草稿</option>
              </select>
            </label>
            <label className="wide-field">
              <span>正文</span>
              <textarea
                value={editingPolicy.content}
                onChange={(event) =>
                  setEditingPolicy((current) =>
                    current ? { ...current, content: event.target.value } : current,
                  )
                }
                rows={12}
              />
            </label>
            <div className="admin-modal-actions">
              <button
                className="primary-button"
                disabled={busy === `policy-${editingPolicy.slug}`}
                onClick={() => void savePolicy()}
              >
                {busy === `policy-${editingPolicy.slug}` ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                <span>保存</span>
              </button>
              <button className="secondary-button" onClick={() => setEditingPolicy(null)}>
                取消
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      {(message || error) && (
        <div className="app-message-layer is-alert-layer" role="presentation">
          <section
            className={error ? 'app-message is-error' : 'app-message is-success'}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="admin-message-title"
          >
            <div>
              <h2 id="admin-message-title">{error ? '提示' : '已完成'}</h2>
              <p>{error || message}</p>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setError(null);
                setMessage(null);
              }}
            >
              知道了
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

function AdminModal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="admin-modal-layer" role="presentation">
      <section
        className="admin-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
      >
        <div className="admin-modal-title">
          <h2 id="admin-modal-title">{title}</h2>
          <button className="secondary-button" type="button" onClick={onClose}>
            关闭
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function SettingsPanel({
  settings,
  form,
  busy,
  onChange,
  onSave,
  onTestTelegram,
  onTestCloudflare,
  onGenerateCloudflareSigningKey,
}: {
  settings: AdminSettings;
  form: typeof emptySettingsForm;
  busy: string | null;
  onChange: (key: keyof typeof emptySettingsForm, value: string) => void;
  onSave: () => void;
  onTestTelegram: () => void;
  onTestCloudflare: () => void;
  onGenerateCloudflareSigningKey: () => void;
}) {
  return (
    <>
      <section className="admin-panel">
        <h2>Telegram Bot</h2>
        <SecretStatus label="Bot Token" field={settings.telegramBotToken} />
        <label>
          <span>Bot Token</span>
          <input
            value={form.telegramBotToken}
            onChange={(event) => onChange('telegramBotToken', event.target.value)}
            placeholder="留空则保留已保存 Token"
          />
        </label>
      </section>

      <section className="admin-panel">
        <h2>Cloudflare Stream</h2>
        <div className="admin-grid">
          <label>
            <span>Account ID</span>
            <input
              value={form.cloudflareAccountId}
              onChange={(event) => onChange('cloudflareAccountId', event.target.value)}
            />
          </label>
          <label>
            <span>Customer Subdomain</span>
            <input
              value={form.cloudflareCustomerSubdomain}
              onChange={(event) =>
                onChange('cloudflareCustomerSubdomain', event.target.value)
              }
              placeholder="customer-xxxx.cloudflarestream.com"
            />
          </label>
          <label>
            <span>API Token</span>
            <input
              value={form.cloudflareApiToken}
              onChange={(event) => onChange('cloudflareApiToken', event.target.value)}
              placeholder="留空则保留已保存 Token"
            />
          </label>
          <label>
            <span>Stream Signing Key ID</span>
            <input
              value={form.cloudflareStreamSigningKeyId}
              onChange={(event) =>
                onChange('cloudflareStreamSigningKeyId', event.target.value)
              }
            />
          </label>
          <label>
            <span>Stream Signing Private Key</span>
            <textarea
              value={form.cloudflareStreamSigningPrivateKey}
              onChange={(event) =>
                onChange('cloudflareStreamSigningPrivateKey', event.target.value)
              }
              placeholder="留空则保留已保存私钥"
              rows={5}
            />
          </label>
          <label>
            <span>默认测试视频 UID</span>
            <input
              value={form.demoCloudflareVideoUid}
              onChange={(event) => onChange('demoCloudflareVideoUid', event.target.value)}
            />
          </label>
          <label>
            <span>官方水印</span>
            <input
              value={form.officialWatermarkText}
              onChange={(event) => onChange('officialWatermarkText', event.target.value)}
            />
          </label>
          <label>
            <span>单用户同时播放数</span>
            <input
              value={form.maxConcurrentPlaySessions}
              onChange={(event) =>
                onChange('maxConcurrentPlaySessions', event.target.value)
              }
              placeholder="1 表示只允许一个播放窗口，0 表示不限制"
            />
          </label>
        </div>
        <div className="secret-list">
          <SecretStatus label="API Token" field={settings.cloudflareApiToken} />
          <SecretStatus
            label="Signing Private Key"
            field={settings.cloudflareStreamSigningPrivateKey}
          />
        </div>
      </section>

      <section className="admin-actions">
        <button
          className="primary-button"
          disabled={busy === 'save-settings'}
          onClick={onSave}
        >
          {busy === 'save-settings' ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
          <span>保存配置</span>
        </button>
        <button className="secondary-button" onClick={onTestTelegram}>
          <CheckCircle2 size={18} />
          <span>测试 Telegram</span>
        </button>
        <button className="secondary-button" onClick={onTestCloudflare}>
          <Cloud size={18} />
          <span>测试 Cloudflare</span>
        </button>
        <button
          className="secondary-button"
          disabled={busy === 'cloudflare-signing-key'}
          onClick={onGenerateCloudflareSigningKey}
        >
          {busy === 'cloudflare-signing-key' ? (
            <Loader2 className="spin" size={18} />
          ) : (
            <KeyRound size={18} />
          )}
          <span>生成 Stream Signing Key</span>
        </button>
      </section>
    </>
  );
}

function PaymentsPanel({
  form,
  busy,
  onChange,
  onSave,
}: {
  form: typeof emptySettingsForm;
  busy: string | null;
  onChange: (key: keyof typeof emptySettingsForm, value: string) => void;
  onSave: () => void;
}) {
  const telegramEnabled = form.telegramPaymentsEnabled === 'true';

  return (
    <>
      <section className="admin-panel">
        <h2>支付方式</h2>
        <article className="payment-method">
          <div className="payment-method-header">
            <div>
              <strong>Telegram Stars</strong>
              <span>{telegramEnabled ? '已启用' : '未启用'}</span>
            </div>
            <button
              className={telegramEnabled ? 'toggle-button active' : 'toggle-button'}
              type="button"
              onClick={() =>
                onChange(
                  'telegramPaymentsEnabled',
                  telegramEnabled ? 'false' : 'true',
                )
              }
            >
              {telegramEnabled ? '停用' : '启用'}
            </button>
          </div>
          <p className="muted-line">
            数字内容在 Telegram Mini App 内只使用 Stars，发票币种为 XTR，不需要第三方支付 Token。
          </p>
        </article>
      </section>

      <section className="admin-actions">
        <button
          className="primary-button"
          disabled={busy === 'save-settings'}
          onClick={onSave}
        >
          {busy === 'save-settings' ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
          <span>保存支付设置</span>
        </button>
      </section>
    </>
  );
}

function OrderDetailPanel({
  order,
}: {
  order: AdminOrderDetail;
}) {
  return (
    <section className="detail-panel">
      <div className="detail-grid">
        <DetailItem label="订单状态" value={order.status} />
        <DetailItem label="支付方式" value={formatPaymentProvider(order.provider)} />
        <DetailItem
          label="支付流水"
          value={order.providerPaymentId || '-'}
        />
        <DetailItem label="金额" value={formatMoney(order.amountCents, order.currency)} />
        <DetailItem label="创建时间" value={formatDate(order.createdAt)} />
        <DetailItem label="支付时间" value={order.paidAt ? formatDate(order.paidAt) : '-'} />
        <DetailItem label="用户" value={order.user.username || order.user.telegramUserId} />
        <DetailItem label="Telegram ID" value={order.user.telegramUserId} />
        <DetailItem label="视频" value={order.video.title} />
        <DetailItem label="视频状态" value={order.video.status} />
        <DetailItem label="视频 UID" value={order.video.cloudflareVideoUid} />
        <DetailItem label="权限状态" value={order.entitlement?.status || '无'} />
      </div>
      <DataTable
        headers={['Session', 'IP', '事件', '创建时间', '最后心跳']}
        rows={order.playSessions.map((session) => [
          session.sessionCode,
          session.ipAddress || '-',
          session.eventCount,
          formatDate(session.createdAt),
          session.lastSeenAt ? formatDate(session.lastSeenAt) : '-',
        ])}
      />
    </section>
  );
}

function UserDetailPanel({
  user,
  onClose,
}: {
  user: AdminUserDetail;
  onClose: () => void;
}) {
  return (
    <section className="detail-panel">
      <div className="panel-title-row">
        <h2>用户详情 {user.username || user.telegramUserId}</h2>
        <button className="secondary-button" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="detail-grid">
        <DetailItem label="Telegram ID" value={user.telegramUserId} />
        <DetailItem label="用户名" value={user.username || '-'} />
        <DetailItem label="姓名" value={[user.firstName, user.lastName].filter(Boolean).join(' ') || '-'} />
        <DetailItem label="语言" value={user.languageCode || '-'} />
        <DetailItem label="状态" value={user.status} />
        <DetailItem label="风险分" value={user.riskScore} />
        <DetailItem label="封禁原因" value={user.banReason || '-'} />
        <DetailItem label="积分余额" value={user.creditBalance} />
        <DetailItem label="订单数" value={user.orders.length} />
        <DetailItem label="权限数" value={user.entitlements.length} />
      </div>
      <DataTable
        headers={['时间', '类型', '变动', '余额', '视频', '订单', '备注']}
        rows={user.creditTransactions.map((transaction) => [
          formatDate(transaction.createdAt),
          transaction.type,
          transaction.amount > 0 ? `+${transaction.amount}` : transaction.amount,
          transaction.balanceAfter,
          transaction.video?.title || '-',
          transaction.order?.orderCode || '-',
          transaction.note || '-',
        ])}
      />
      <DataTable
        headers={['订单', '视频', '状态', '支付', '金额', '时间']}
        rows={user.orders.map((order) => [
          order.orderCode,
          order.video.title,
          order.status,
          formatPaymentProvider(order.provider),
          formatMoney(order.amountCents, order.currency),
          formatDate(order.createdAt),
        ])}
      />
      <DataTable
        headers={['权限', '视频', '订单', '状态', '开始时间']}
        rows={user.entitlements.map((entitlement) => [
          entitlement.id,
          entitlement.video.title,
          entitlement.order.orderCode,
          entitlement.status,
          formatDate(entitlement.startsAt),
        ])}
      />
      <DataTable
        headers={['Session', '订单', '视频', 'IP', '事件', '最后心跳']}
        rows={user.playSessions.map((session) => [
          session.sessionCode,
          session.order.orderCode,
          session.video.title,
          session.ipAddress || '-',
          session.eventCount,
          session.lastSeenAt ? formatDate(session.lastSeenAt) : '-',
        ])}
      />
    </section>
  );
}

function SessionDetailPanel({
  session,
  onClose,
}: {
  session: PlaySessionDetail;
  onClose: () => void;
}) {
  return (
    <section className="detail-panel">
      <div className="panel-title-row">
        <h2>播放事件 {session.sessionCode}</h2>
        <button className="secondary-button" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="detail-grid">
        <DetailItem label="订单" value={session.order.orderCode} />
        <DetailItem label="视频" value={session.video.title} />
        <DetailItem label="用户" value={session.user.username || session.user.telegramUserId} />
        <DetailItem label="IP" value={session.ipAddress || '-'} />
        <DetailItem label="创建时间" value={formatDate(session.createdAt)} />
        <DetailItem label="过期时间" value={formatDate(session.tokenExpiresAt)} />
      </div>
      <DataTable
        headers={['时间', '事件', '播放位置']}
        rows={session.events.map((event) => [
          formatDate(event.createdAt),
          event.eventType,
          event.playbackPositionSeconds ?? '-',
        ])}
      />
    </section>
  );
}

function DetailItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelTitle({
  title,
  onRefresh,
}: {
  title: string;
  onRefresh: () => void;
}) {
  return (
    <div className="panel-title-row">
      <h2>{title}</h2>
      <button className="icon-button" onClick={onRefresh} aria-label="刷新">
        <RefreshCw size={18} />
      </button>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <div className="admin-table">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function uploadFileToUrl(
  uploadUrl: string,
  file: File,
  onProgress: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file);

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }

      onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
        return;
      }

      reject(new Error(`Cloudflare 上传失败：HTTP ${request.status}`));
    };
    request.onerror = () => reject(new Error('Cloudflare 上传网络失败'));
    request.open('POST', uploadUrl);
    request.send(form);
  });
}

function SecretStatus({ label, field }: { label: string; field: FieldStatus }) {
  return (
    <div className="secret-status">
      <EyeOff size={16} />
      <span>{label}</span>
      <strong>{field.hasValue ? field.masked : '未配置'}</strong>
    </div>
  );
}

function formatPaymentProvider(provider: string) {
  const labels: Record<string, string> = {
    telegram_stars: 'Telegram Stars',
    project_credits: '项目积分',
    admin: '后台发放',
    manual: '手动支付',
    mock: '模拟支付',
    telegram: 'Telegram',
    usdt: 'USDT',
    stripe: 'Stripe',
  };

  return labels[provider] || provider || '-';
}

function formatMoney(amountCents: number, currency: string) {
  if (currency === 'XTR') {
    return `${amountCents}⭐`;
  }

  if (currency === 'CREDITS') {
    return `${amountCents}积分`;
  }

  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
  }).format(amountCents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
