import {
  ArrowLeft,
  Clock3,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  UserCircle,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from 'react';
import { apiFetch, type PlayResponse, type Video } from './api';

type User = {
  id: number;
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
  creditBalance: number;
};

type AuthResponse = {
  user: User;
};

type VideosResponse = {
  series?: SeriesGroup[];
  videos: Video[];
};

type SeriesGroup = {
  id: number;
  title: string;
  description: string | null;
  slug: string;
  videos: Video[];
};

type ScrollState = {
  canScroll: boolean;
  atStart: boolean;
  atEnd: boolean;
};

type TelegramInvoiceResponse = {
  alreadyPaid: boolean;
  invoiceLink?: string;
  order: {
    orderCode: string;
    status: string;
  };
};

type CreditPurchaseResponse = {
  alreadyPaid: boolean;
  user: User;
  order: {
    orderCode: string;
    status: string;
  };
};

type FreeClaimResponse = CreditPurchaseResponse;

type CreditPackage = {
  id: number;
  title: string;
  starsAmount: number;
  creditsAmount: number;
};

type CreditPackagesResponse = {
  packages: CreditPackage[];
};

type CreditExchangeInvoiceResponse = {
  invoiceLink: string;
  order: {
    orderCode: string;
    status: string;
    starsAmount: number;
    creditsAmount: number;
  };
};

type PolicyResponse = {
  policy: {
    slug: string;
    title: string;
    content: string;
    updatedAt: string;
  };
};

const policyPathMap: Record<string, string> = {
  '/terms': 'terms',
  '/refund': 'refund',
  '/ban-rules': 'ban-rules',
  '/copyright': 'copyright',
};

function formatPrice(video: Video) {
  if (video.currency === 'XTR' && video.priceCents <= 0) {
    return '价格：0Stars';
  }

  if (video.currency === 'XTR') {
    return video.priceCredits > 0
      ? `价格：${video.priceCents}Stars或${video.priceCredits}积分`
      : `价格：${video.priceCents}Stars`;
  }

  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: video.currency,
  }).format(video.priceCents / 100);
}

function isFreeVideo(video: Video) {
  return video.currency === 'XTR' && video.priceCents <= 0;
}

function coverUrl(video: Video | undefined) {
  return video?.thumbnailUrl || '/assets/covers/default-cover.png';
}

function handleCoverError(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;

  if (!image.src.endsWith('/assets/covers/default-cover.png')) {
    image.src = '/assets/covers/default-cover.png';
  }
}

function randomWatermarkPosition(kind: 'official' | 'order'): CSSProperties {
  const edgePadding = kind === 'official' ? 12 : 18;
  const range = 100 - edgePadding * 2;
  const top = edgePadding + Math.random() * range;
  const left = edgePadding + Math.random() * range;

  return {
    top: `${top.toFixed(1)}%`,
    left: `${left.toFixed(1)}%`,
  };
}

function formatPolicyDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

export function App() {
  const policySlug = policyPathMap[window.location.pathname];

  if (policySlug) {
    return <PolicyPage slug={policySlug} />;
  }

  const [user, setUser] = useState<User | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [seriesCatalog, setSeriesCatalog] = useState<SeriesGroup[]>([]);
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  const [playback, setPlayback] = useState<PlayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyVideoId, setBusyVideoId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [purchaseChoiceVideo, setPurchaseChoiceVideo] = useState<Video | null>(null);
  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [creditExchangeOpen, setCreditExchangeOpen] = useState(false);
  const [selectedCreditPackage, setSelectedCreditPackage] = useState<CreditPackage | null>(null);
  const [busyPackageId, setBusyPackageId] = useState<number | null>(null);
  const trackRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [scrollStateBySeriesKey, setScrollStateBySeriesKey] = useState<
    Record<string, ScrollState>
  >({});

  const seriesKey = useCallback(
    (series: SeriesGroup) => String(series.id || series.slug),
    [],
  );

  const updateScrollState = useCallback((key: string) => {
    const track = trackRefs.current[key];

    if (!track) {
      return;
    }

    const canScroll = track.scrollWidth > track.clientWidth + 2;
    const atStart = track.scrollLeft <= 2;
    const atEnd =
      track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;

    setScrollStateBySeriesKey((current) => ({
      ...current,
      [key]: { canScroll, atStart, atEnd },
    }));
  }, []);

  const scrollSeries = useCallback(
    (key: string, direction: -1 | 1) => {
      const track = trackRefs.current[key];

      if (!track) {
        return;
      }

      track.scrollBy({
        left: direction * Math.max(track.clientWidth * 0.82, 260),
        behavior: 'smooth',
      });

      window.setTimeout(() => updateScrollState(key), 260);
    },
    [updateScrollState],
  );

  async function load() {
    setError(null);
    setLoading(true);

    try {
      if (!window.Telegram?.WebApp.initData) {
        throw new Error('请从 Telegram 中打开你的 Bot');
      }

      const auth = await apiFetch<AuthResponse>('/api/auth/telegram', {
        method: 'POST',
      });
      const [catalog, packagesResponse] = await Promise.all([
        apiFetch<VideosResponse>('/api/videos'),
        apiFetch<CreditPackagesResponse>('/api/credits/packages'),
      ]);

      setUser(auth.user);
      setVideos(catalog.videos);
      setSeriesCatalog(catalog.series || []);
      setCreditPackages(packagesResponse.packages);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const groupedVideos = useMemo(() => {
    if (seriesCatalog.length) {
      return seriesCatalog;
    }

    return [
      {
        id: 0,
        title: '未分组',
        description: null,
        slug: 'uncategorized',
        videos,
      },
    ];
  }, [seriesCatalog, videos]);

  useEffect(() => {
    const updateAll = () => {
      groupedVideos.forEach((series) => updateScrollState(seriesKey(series)));
    };

    updateAll();
    window.addEventListener('resize', updateAll);

    return () => window.removeEventListener('resize', updateAll);
  }, [groupedVideos, seriesKey, updateScrollState]);

  async function purchaseWithStars(video: Video) {
    setError(null);
    setNotice(null);
    setPurchaseChoiceVideo(null);
    setBusyVideoId(video.id);

    try {
      if (window.Telegram?.WebApp.initData && window.Telegram.WebApp.openInvoice) {
        const invoice = await apiFetch<TelegramInvoiceResponse>(
          '/api/payments/telegram/invoice',
          {
            method: 'POST',
            body: JSON.stringify({ videoId: video.id }),
          },
        );

        if (invoice.alreadyPaid) {
          await load();
          await startPlayback({ ...video, hasAccess: true });
          return;
        }

        if (!invoice.invoiceLink) {
          throw new Error('发票链接创建失败');
        }

        await new Promise<void>((resolve, reject) => {
          window.Telegram!.WebApp.openInvoice!(invoice.invoiceLink!, (status) => {
            if (status === 'paid') {
              resolve();
              return;
            }

            reject(new Error(status === 'cancelled' ? '支付已取消' : '支付未完成'));
          });
        });

        await load();
        await startPlayback({ ...video, hasAccess: true });
        return;
      }

      throw new Error('请检查你的 Telegram ⭐ 是否充足，可在Telegram应用设置选项的My Stars中购买。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '购买失败');
    } finally {
      setBusyVideoId(null);
    }
  }

  async function purchaseWithCredits(video: Video) {
    setError(null);
    setNotice(null);
    setPurchaseChoiceVideo(null);
    setBusyVideoId(video.id);

    try {
      const response = await apiFetch<CreditPurchaseResponse>(
        '/api/payments/credits/purchase',
        {
          method: 'POST',
          body: JSON.stringify({ videoId: video.id }),
        },
      );

      setUser(response.user);
      await load();
      await startPlayback({ ...video, hasAccess: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '积分购买失败');
    } finally {
      setBusyVideoId(null);
    }
  }

  async function claimFreeVideo(video: Video) {
    setError(null);
    setNotice(null);
    setPurchaseChoiceVideo(null);
    setBusyVideoId(video.id);

    try {
      const response = await apiFetch<FreeClaimResponse>(
        '/api/payments/free/claim',
        {
          method: 'POST',
          body: JSON.stringify({ videoId: video.id }),
        },
      );

      setUser(response.user);
      await load();
      await startPlayback({ ...video, hasAccess: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '免费领取失败');
    } finally {
      setBusyVideoId(null);
    }
  }

  async function exchangeCredits(creditPackage: CreditPackage) {
    setError(null);
    setNotice(null);
    setBusyPackageId(creditPackage.id);

    try {
      if (!window.Telegram?.WebApp.initData || !window.Telegram.WebApp.openInvoice) {
        throw new Error('请检查你的 Telegram ⭐ 是否充足，可在Telegram应用设置选项的My Stars中购买。');
      }

      const invoice = await apiFetch<CreditExchangeInvoiceResponse>(
        '/api/payments/credits/exchange/invoice',
        {
          method: 'POST',
          body: JSON.stringify({ packageId: creditPackage.id }),
        },
      );

      if (!invoice.invoiceLink) {
        throw new Error('发票链接创建失败');
      }

      await new Promise<void>((resolve, reject) => {
        window.Telegram!.WebApp.openInvoice!(invoice.invoiceLink, (status) => {
          if (status === 'paid') {
            resolve();
            return;
          }

          reject(new Error(status === 'cancelled' ? '兑换已取消' : '兑换未完成'));
        });
      });

      await load();
      setCreditExchangeOpen(false);
      setSelectedCreditPackage(null);
      setProfileOpen(false);
      setNotice(`已使用 ${creditPackage.starsAmount}Stars 兑换 ${creditPackage.creditsAmount}积分。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '使用 Stars 兑换积分失败');
    } finally {
      setBusyPackageId(null);
    }
  }

  async function startPlayback(video: Video) {
    setError(null);
    setNotice(null);
    setBusyVideoId(video.id);

    try {
      const playResponse = await apiFetch<PlayResponse>(
        `/api/videos/${video.id}/play`,
        { method: 'POST' },
      );
      setActiveVideo(video);
      setPlayback(playResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '播放失败');
    } finally {
      setBusyVideoId(null);
    }
  }

  if (playback && activeVideo) {
    return (
      <PlayerView
        video={activeVideo}
        playback={playback}
        onBack={() => {
          setPlayback(null);
          setActiveVideo(null);
          void load();
        }}
      />
    );
  }

  return (
    <>
      {(error || notice) && (
        <div className="app-message-layer is-alert-layer" role="presentation">
          <section
            className={error ? 'app-message is-error' : 'app-message is-success'}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-message-title"
          >
            <div>
              <h2 id="app-message-title">{error ? '提示' : '已完成'}</h2>
              <p>{error || notice}</p>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setError(null);
                setNotice(null);
              }}
            >
              知道了
            </button>
          </section>
        </div>
      )}
      {purchaseChoiceVideo && (
        <div className="app-message-layer is-modal-layer" role="presentation">
          <section
            className="app-message purchase-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-choice-title"
          >
            <div>
              <h2 id="purchase-choice-title">选择购买方式</h2>
              <p>{purchaseChoiceVideo.title}</p>
              <strong className="purchase-price">
                {formatPrice(purchaseChoiceVideo)}
              </strong>
            </div>
            <div className="purchase-options">
              {isFreeVideo(purchaseChoiceVideo) ? (
                <button
                  className="primary-button"
                  type="button"
                  disabled={busyVideoId === purchaseChoiceVideo.id}
                  onClick={() => void claimFreeVideo(purchaseChoiceVideo)}
                >
                  <ShoppingCart size={18} />
                  <span>0Stars 免费领取</span>
                </button>
              ) : (
                <>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={busyVideoId === purchaseChoiceVideo.id}
                    onClick={() => void purchaseWithStars(purchaseChoiceVideo)}
                  >
                    <ShoppingCart size={18} />
                    <span>{purchaseChoiceVideo.priceCents}Stars 直接购买</span>
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={
                      busyVideoId === purchaseChoiceVideo.id ||
                      purchaseChoiceVideo.priceCredits <= 0
                    }
                    onClick={() => void purchaseWithCredits(purchaseChoiceVideo)}
                  >
                    <span>{purchaseChoiceVideo.priceCredits}积分 使用余额</span>
                  </button>
                </>
              )}
            </div>
            <p className="muted-line">
              我的积分：{user?.creditBalance ?? 0}
            </p>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setPurchaseChoiceVideo(null)}
            >
              取消
            </button>
          </section>
        </div>
      )}
      {creditExchangeOpen && (
        <div className="app-message-layer is-modal-layer" role="presentation">
          <section
            className="app-message purchase-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="credit-exchange-title"
          >
            <div>
              <h2 id="credit-exchange-title">使用 Stars 兑换积分</h2>
              <p>先选择套餐，再确认兑换。支付完成后积分将自动到账。</p>
            </div>
            <div className="credit-package-list">
              {creditPackages.map((creditPackage) => (
                <button
                  className={`credit-package ${
                    selectedCreditPackage?.id === creditPackage.id ? 'is-selected' : ''
                  }`}
                  type="button"
                  key={creditPackage.id}
                  disabled={busyPackageId === creditPackage.id}
                  onClick={() => setSelectedCreditPackage(creditPackage)}
                >
                  <span>{creditPackage.starsAmount}Stars</span>
                  <strong>{creditPackage.creditsAmount}积分</strong>
                </button>
              ))}
            </div>
            {selectedCreditPackage && (
              <p className="exchange-confirm-copy">
                确认使用 {selectedCreditPackage.starsAmount}Stars 兑换{' '}
                {selectedCreditPackage.creditsAmount}积分。
              </p>
            )}
            <button
              className="primary-button"
              type="button"
              disabled={!selectedCreditPackage || busyPackageId !== null}
              onClick={() => {
                if (selectedCreditPackage) {
                  void exchangeCredits(selectedCreditPackage);
                }
              }}
            >
              {busyPackageId ? <Loader2 className="spin" size={18} /> : null}
              <span>确认兑换</span>
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setCreditExchangeOpen(false);
                setSelectedCreditPackage(null);
              }}
            >
              取消
            </button>
          </section>
        </div>
      )}
      <header className="site-header">
        <a className="brand" href="/" aria-label="TG Video">
          <span className="brand-text">TG Video</span>
        </a>
        <div className="profile-menu-wrap">
          <button
            className="profile-trigger"
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            aria-label="个人中心"
            aria-expanded={profileOpen}
          >
            <span className="profile-avatar" aria-hidden="true">
              <UserCircle size={22} />
            </span>
            <span>{user?.creditBalance ?? 0}积分</span>
          </button>
          {profileOpen && (
            <section className="profile-popover" aria-label="个人中心">
              <div>
                <strong>{user?.username ? `@${user.username}` : user?.firstName || '我的账号'}</strong>
                <span>TG ID：{user?.telegramUserId || '-'}</span>
              </div>
              <div className="profile-balance">
                <span>我的积分</span>
                <strong>{user?.creditBalance ?? 0}</strong>
              </div>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  setSelectedCreditPackage(null);
                  setCreditExchangeOpen(true);
                }}
              >
                <span>使用 Stars 兑换积分</span>
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  void load();
                }}
              >
                <RefreshCw size={16} />
                <span>刷新</span>
              </button>
            </section>
          )}
        </div>
      </header>

      <main className="app-shell">
        <section className="intro">
          <div className="intro-copy">
            <p className="eyebrow">TG Video</p>
            <h1>按系列浏览视频</h1>
            <p>使用 Telegram Mini App、Cloudflare Stream 和订单水印构建视频售卖体验。</p>
          </div>
          <div className="intro-flame" aria-hidden="true">
            <img src="/assets/img/intro-flame-option1.jpg" alt="" />
          </div>
        </section>

      {loading ? (
        <div className="loading-state">
          <Loader2 className="spin" size={24} />
        </div>
      ) : (
        <section className="catalog-section">
          <div className="catalog-heading">
            <div>
              <p className="eyebrow">CATALOG</p>
              <h2>剧集目录</h2>
            </div>
            <p>全部作品，按系列浏览</p>
          </div>
          <div className="series-stack">
          {groupedVideos.map((series) => {
            const key = seriesKey(series);
            const scrollState = scrollStateBySeriesKey[key] || {
              canScroll: false,
              atStart: true,
              atEnd: true,
            };

            return (
            <section
              className={
                scrollState.canScroll
                  ? 'series-section has-scroll'
                  : 'series-section'
              }
              key={key}
            >
              <div className="series-heading">
                <div>
                  <h3>{series.title}</h3>
                  {series.description && <p>{series.description}</p>}
                </div>
                <span className="series-state">共 {series.videos.length} 集</span>
              </div>
              <div className="series-content">
                <div className="series-poster" aria-hidden="true">
                  <img
                    src={coverUrl(series.videos[0])}
                    alt=""
                    onError={handleCoverError}
                  />
                </div>
                <div className="episode-strip">
                  <button
                    className="episode-scroll is-prev"
                    type="button"
                    disabled={!scrollState.canScroll || scrollState.atStart}
                    onClick={() => scrollSeries(key, -1)}
                    aria-label="向左滑动视频"
                  >
                    <span aria-hidden="true">‹</span>
                  </button>
                  <div
                    className="episode-track"
                    ref={(element) => {
                      trackRefs.current[key] = element;
                    }}
                    onScroll={() => updateScrollState(key)}
                    aria-label={`${series.title} 视频列表`}
                  >
                {series.videos.length === 0 && (
                  <div className="episode-empty">
                    <strong>暂无视频</strong>
                    <span>该系列的视频上架后会显示在这里。</span>
                  </div>
                )}
                {series.videos.map((video) => (
                  <article className="episode-item" key={video.id}>
                    <div className="episode-cover">
                      <img
                        src={coverUrl(video)}
                        alt=""
                        onError={handleCoverError}
                      />
                    </div>
                    <div className="video-meta">
                      <span className="episode-number">
                        {video.series?.title || series.title}
                      </span>
                      <h4>{video.title}</h4>
                      {video.description && <p>{video.description}</p>}
                    </div>
                    <div className="video-actions">
                      <span className={video.hasAccess ? 'access-pill active' : 'access-pill'}>
                        {video.hasAccess ? (isFreeVideo(video) ? '已领取' : '已购买') : formatPrice(video)}
                      </span>
                      <button
                        className="primary-button"
                        disabled={busyVideoId === video.id}
                        onClick={() =>
                          video.hasAccess
                            ? void startPlayback(video)
                            : isFreeVideo(video)
                              ? void claimFreeVideo(video)
                              : setPurchaseChoiceVideo(video)
                        }
                      >
                        {busyVideoId === video.id ? (
                          <Loader2 className="spin" size={18} />
                        ) : video.hasAccess ? (
                          <Play size={18} />
                        ) : (
                          <ShoppingCart size={18} />
                        )}
                        <span>{video.hasAccess ? '播放' : isFreeVideo(video) ? '领取' : '购买'}</span>
                      </button>
                    </div>
                  </article>
                ))}
                  </div>
                  <button
                    className="episode-scroll is-next"
                    type="button"
                    disabled={!scrollState.canScroll || scrollState.atEnd}
                    onClick={() => scrollSeries(key, 1)}
                    aria-label="向右滑动视频"
                  >
                    <span aria-hidden="true">›</span>
                  </button>
                </div>
              </div>
            </section>
            );
          })}
          </div>
        </section>
      )}
      <SiteFooter />
      </main>
    </>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <a href="/terms">用户协议</a>
      <a href="/refund">退款说明</a>
      <a href="/ban-rules">封号规则</a>
      <a href="/copyright">版权声明</a>
      <a href="https://t.me/your_support_bot" target="_blank" rel="noreferrer">
        客服 @your_support_bot
      </a>
    </footer>
  );
}

function PolicyPage({ slug }: { slug: string }) {
  const [policy, setPolicy] = useState<PolicyResponse['policy'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    apiFetch<PolicyResponse>(`/api/policies/${slug}`)
      .then((response) => {
        if (mounted) {
          setPolicy(response.policy);
        }
      })
      .catch((caught) => {
        if (mounted) {
          setError(caught instanceof Error ? caught.message : '页面加载失败');
        }
      });

    return () => {
      mounted = false;
    };
  }, [slug]);

  return (
    <main className="policy-page">
      <a className="brand" href="/" aria-label="TG Video">
        <span className="brand-text">TG Video</span>
      </a>
      <article className="policy-card">
        {error && <p className="error-line">{error}</p>}
        {!policy && !error && <p className="muted-line">正在加载...</p>}
        {policy && (
          <>
            <p className="eyebrow">TG Video</p>
            <h1>{policy.title}</h1>
            <p className="muted-line">更新时间：{formatPolicyDate(policy.updatedAt)}</p>
            <div className="policy-content">
              {policy.content.split('\n').map((line, index) => (
                <p key={`${policy.slug}-${index}`}>{line}</p>
              ))}
            </div>
          </>
        )}
      </article>
      <SiteFooter />
    </main>
  );
}

function PlayerView({
  video,
  playback,
  onBack,
}: {
  video: Video;
  playback: PlayResponse;
  onBack: () => void;
}) {
  const [orderPosition, setOrderPosition] = useState<CSSProperties>(() =>
    randomWatermarkPosition('order'),
  );
  const [officialPosition, setOfficialPosition] = useState<CSSProperties>(() =>
    randomWatermarkPosition('official'),
  );
  const [leaving, setLeaving] = useState(false);
  const sessionClosedRef = useRef(false);
  const sendEvent = useCallback(
    (eventType: 'play' | 'pause' | 'heartbeat' | 'ended') =>
      apiFetch(`/api/play-sessions/${playback.sessionCode}/events`, {
        method: 'POST',
        body: JSON.stringify({ eventType }),
      }).catch(() => undefined),
    [playback.sessionCode],
  );
  const closeSession = useCallback(async () => {
    if (sessionClosedRef.current) {
      return;
    }

    sessionClosedRef.current = true;
    await apiFetch(`/api/play-sessions/${playback.sessionCode}/end`, {
      method: 'POST',
      keepalive: true,
    }).catch(() => undefined);
  }, [playback.sessionCode]);

  useEffect(() => {
    const orderMovement = window.setInterval(() => {
      setOrderPosition(randomWatermarkPosition('order'));
    }, 10000);
    const officialMovement = window.setInterval(() => {
      setOfficialPosition(randomWatermarkPosition('official'));
    }, 6500);

    const heartbeat = window.setInterval(() => {
      void sendEvent('heartbeat');
    }, 20000);

    const handleVisibilityChange = () => {
      void sendEvent(document.hidden ? 'pause' : 'play');
    };
    const handlePageHide = () => {
      void closeSession();
    };

    void sendEvent('play');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.clearInterval(orderMovement);
      window.clearInterval(officialMovement);
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      void closeSession();
    };
  }, [closeSession, sendEvent]);

  const isDemo = playback.playbackUrl.includes('demo-video-uid');
  const tokenExpiresAt = new Date(playback.tokenExpiresAt);
  const expireText = Number.isNaN(tokenExpiresAt.getTime())
    ? '-'
    : new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(tokenExpiresAt);
  const handleBack = async () => {
    setLeaving(true);
    await closeSession();
    onBack();
  };

  return (
    <main className="player-page">
      <header className="player-header">
        <button
          className="icon-button"
          disabled={leaving}
          onClick={() => void handleBack()}
          aria-label="返回"
        >
          {leaving ? <Loader2 className="spin" size={19} /> : <ArrowLeft size={19} />}
        </button>
        <div>
          <h1>{video.title}</h1>
          <span>{video.series?.title || '未分组'} · {formatPrice(video)}</span>
        </div>
        <strong className="player-status">
          <ShieldCheck size={16} />
          播放保护中
        </strong>
      </header>

      <section className="player-layout">
        <div className="player-shell">
          {isDemo ? (
            <div className="demo-player">
              <Play size={42} />
              <span>Cloudflare Stream UID 未配置</span>
            </div>
          ) : (
            <iframe
              className="stream-frame"
              src={playback.playbackUrl}
              title={video.title}
              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
              allowFullScreen
            />
          )}

          <div className="official-watermark" style={officialPosition}>
            {playback.watermarks.official}
          </div>
          <div className="order-watermark" style={orderPosition}>
            {playback.watermarks.orderCode}
          </div>
        </div>

        <aside className="player-info-panel">
          <div>
            <p className="eyebrow">正在观看</p>
            <h2>{video.title}</h2>
            {video.description && <p>{video.description}</p>}
          </div>
          <div className="player-meta-grid">
            <div className="player-meta-item">
              <Clock3 size={17} />
              <span>本次播放有效</span>
              <strong>{expireText}</strong>
            </div>
            <div className="player-meta-item">
              <ShieldCheck size={17} />
              <span>订单水印</span>
              <strong>{playback.watermarks.orderCode}</strong>
            </div>
          </div>
          <p className="player-note">
            注意：录屏或二次转卖会根据订单水印进行封号处理！
          </p>
        </aside>
      </section>
    </main>
  );
}
