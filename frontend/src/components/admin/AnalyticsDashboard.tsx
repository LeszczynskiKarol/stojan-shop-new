// frontend/src/components/admin/AnalyticsDashboard.tsx
// Internal analytics dashboard for Stojan Shop admin panel
// Displays: overview KPIs, conversion funnel, traffic sources, Google performance,
// time series, devices, top landing pages, hourly heatmap, browsers/OS, sessions list, 404 errors

import { useState, useEffect, useCallback, useMemo } from "react";

const API = (import.meta as any).env?.PUBLIC_API_URL || "http://localhost:4000";

// ============================================
// TYPES
// ============================================
interface Overview {
  totalSessions: number;
  uniqueVisitors: number;
  totalPageViews: number;
  avgDuration: number;
  bounceRate: number;
  conversionRate: number;
  medianDuration: number;
  cartRate: number;
  cartToOrderRate: number;
  totalOrders: number;
  totalRevenue: number;
  prevSessions: number;
  prevOrders: number;
  prevRevenue: number;
  sessionsChange: number;
  revenueChange: number;
  activeSessions: number;
}

interface FunnelStep {
  step: string;
  count: number;
  pct: number;
}

interface TimeSeriesPoint {
  date: string;
  sessions: number;
  uniqueVisitors: number;
  pageViews: number;
  orders: number;
  revenue: number;
  bounceRate: number;
  avgDuration: number;
  conversionRate: number;
}

interface TrafficSource {
  source: string;
  label: string;
  sessions: number;
  orders: number;
  revenue: number;
  conversionRate: number;
  bounceRate: number;
  pct: number;
}

interface GooglePerfChannel {
  sessions: number;
  orders: number;
  revenue: number;
  conversionRate: number;
  bounceRate: number;
}

interface Device {
  device: string;
  label: string;
  sessions: number;
  pct: number;
  orders: number;
  conversionRate: number;
}

interface LandingPage {
  page: string;
  sessions: number;
  orders: number;
  revenue: number;
  bounceRate: number;
  conversionRate: number;
}

interface HourlyPoint {
  hour: number;
  sessions: number;
  orders: number;
}

interface BrowserItem {
  name: string;
  count: number;
  pct: number;
}

interface AnalyticsData {
  overview: Overview;
  funnel: FunnelStep[];
  timeSeries: TimeSeriesPoint[];
  trafficSources: TrafficSource[];
  googlePerformance: {
    shopping: GooglePerfChannel;
    organic: GooglePerfChannel;
    ads: GooglePerfChannel;
  };
  devices: Device[];
  topLandingPages: LandingPage[];
  hourlyDistribution: HourlyPoint[];
  browsers: BrowserItem[];
  operatingSystems: BrowserItem[];
}

interface SessionItem {
  id: string;
  visitorId: string;
  source: string;
  sourceLabel: string;
  medium: string;
  landingPage: string;
  deviceType: string;
  browser: string;
  os: string;
  startedAt: string;
  lastSeenAt: string;
  duration: number;
  pageCount: number;
  hasViewedProduct: boolean;
  hasAddedToCart: boolean;
  hasStartedCheckout: boolean;
  hasOrdered: boolean;
  orderValue: number | null;
  orderId: string | null;
  isBounce: boolean;
  referrer: string | null;
  srsltid: string | null;
  gclid: string | null;
  events: any[];
}

// ── 404 Types ──
interface NotFoundPattern {
  pattern: string;
  count: number;
  uniqueUrls: number;
  pct: number;
}

interface NotFoundUrl {
  url: string;
  count: number;
  pattern: string;
  lastSeen: string;
  sources: string[];
}

interface BrokenInternalLink {
  sourcePage: string;
  count: number;
  targets: string[];
}

interface NotFoundExternalSource {
  source: string;
  count: number;
}

interface NotFoundDaily {
  date: string;
  count: number;
}

interface NotFoundEvent {
  page: string;
  pattern: string;
  referrer: string | null;
  isInternal: boolean;
  source: string;
  device: string;
  createdAt: string;
}

interface NotFoundData {
  total: number;
  totalInternal: number;
  totalExternal: number;
  totalDirect: number;
  byPattern: NotFoundPattern[];
  topUrls: NotFoundUrl[];
  brokenInternalLinks: BrokenInternalLink[];
  externalSources: NotFoundExternalSource[];
  daily: NotFoundDaily[];
  recentEvents: NotFoundEvent[];
}

type Tab =
  | "overview"
  | "sources"
  | "funnel"
  | "pages"
  | "sessions"
  | "errors404";

// ============================================
// HELPERS
// ============================================
const fmt = (v: number) =>
  v.toLocaleString("pl-PL", {
    minimumFractionDigits: v % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

const fmtPln = (v: number) => `${fmt(v)} zł`;

function toLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

function changeArrow(change: number): string {
  if (change > 0) return "↑";
  if (change < 0) return "↓";
  return "–";
}

function changeColor(change: number): string {
  if (change > 0) return "#22c55e";
  if (change < 0) return "#ef4444";
  return "hsl(var(--muted-foreground))";
}

const SOURCE_COLORS: Record<string, string> = {
  google_shopping: "#4285F4",
  google_organic: "#34A853",
  google_ads: "#FBBC05",
  direct: "#6366f1",
  referral: "#ec4899",
  facebook: "#1877F2",
  instagram: "#E4405F",
  allegro: "#FF5A00",
  olx: "#002F34",
  bing: "#008373",
};

const DEVICE_ICONS: Record<string, string> = {
  desktop: "🖥️",
  mobile: "📱",
  tablet: "📋",
};

const PATTERN_LABELS: Record<string, string> = {
  undefined_category: "🐛 /undefined/ (bug frontend)",
  power_kw_old: "⚡ /silniki-elektryczne-{moc}-kw/ (stary WP)",
  producent_old: "🏭 /producent/marka-producent/ (stary WP)",
  legal_old: "📜 /legal/ (stary WP)",
  hamulcem_old: "🔧 /hamulcem/ (brak z-)",
  se_trojfazowe_old: "🔄 /silniki-elektryczne-trojfazowe/",
  se_hamulcem_old: "🔄 /silniki-elektryczne-z-hamulcem/",
  se_catchall: "🔄 /silniki-elektryczne/ (catch-all)",
  bez_kategorii: "📁 /bez-kategorii/",
  woocommerce_old: "🛒 /produkt/ (WooCommerce)",
  wp_content: "📦 /wp-content/",
  wp_admin: "🔒 /wp-admin/",
  php_old: "🐘 .php pliki",
  moc_taxonomy: "⚡ /moc/ (taksonomia WP)",
  tag_old: "🏷️ /tag-produktu/",
  blog: "📝 /blog/",
  valid_category_missing_product: "❌ Kategoria OK, produkt nie istnieje",
  unknown: "❓ Nieznany pattern",
};

const PATTERN_COLORS: Record<string, string> = {
  undefined_category: "#ef4444",
  power_kw_old: "#f59e0b",
  valid_category_missing_product: "#ec4899",
  producent_old: "#8b5cf6",
  blog: "#3b82f6",
  unknown: "#6b7280",
};

// ============================================
// MAIN COMPONENT
// ============================================
export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");

  // Date range
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return toLocalDate(d);
  });
  const [endDate, setEndDate] = useState(() => toLocalDate(new Date()));
  const [groupBy, setGroupBy] = useState("day");

  // Sessions tab state
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsPage, setSessionsPage] = useState(0);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [sessionsTotalPages, setSessionsTotalPages] = useState(0);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsSource, setSessionsSource] = useState("");
  const [sessionsOrdered, setSessionsOrdered] = useState("");
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  // Top products
  const [topProducts, setTopProducts] = useState<any[]>([]);

  // 404 tab state
  const [notFoundData, setNotFoundData] = useState<NotFoundData | null>(null);
  const [notFoundLoading, setNotFoundLoading] = useState(false);

  // ── FETCH MAIN DATA ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ startDate, endDate, groupBy });
      const res = await fetch(`${API}/api/admin/analytics?${params}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || "Błąd pobierania danych");
      }
    } catch (err: any) {
      setError(err.message || "Błąd połączenia");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, groupBy]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── FETCH SESSIONS ──
  const fetchSessions = useCallback(
    async (page = 0) => {
      setSessionsLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: "30",
          startDate,
          endDate,
        });
        if (sessionsSource) params.set("source", sessionsSource);
        if (sessionsOrdered) params.set("hasOrdered", sessionsOrdered);

        const res = await fetch(
          `${API}/api/admin/analytics/sessions?${params}`,
          {
            credentials: "include",
          },
        );
        const json = await res.json();
        if (json.success) {
          setSessions(json.data.sessions);
          setSessionsTotal(json.data.total);
          setSessionsTotalPages(json.data.totalPages);
          setSessionsPage(json.data.page);
        }
      } catch {}
      setSessionsLoading(false);
    },
    [startDate, endDate, sessionsSource, sessionsOrdered],
  );

  // ── FETCH TOP PRODUCTS ──
  const fetchTopProducts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ startDate, endDate, limit: "15" });
      const res = await fetch(
        `${API}/api/admin/analytics/top-products?${params}`,
        {
          credentials: "include",
        },
      );
      const json = await res.json();
      if (json.success) setTopProducts(json.data);
    } catch {}
  }, [startDate, endDate]);

  // ── FETCH 404 STATS ──
  const fetch404Stats = useCallback(async () => {
    setNotFoundLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(
        `${API}/api/admin/analytics/404-stats?${params}`,
        { credentials: "include" },
      );
      const json = await res.json();
      if (json.success) setNotFoundData(json.data);
    } catch {}
    setNotFoundLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    if (tab === "sessions") fetchSessions(0);
    if (tab === "pages") fetchTopProducts();
    if (tab === "errors404") fetch404Stats();
  }, [tab, fetchSessions, fetchTopProducts, fetch404Stats]);

  // ── QUICK DATE PRESETS ──
  const setPreset = (preset: string) => {
    const now = new Date();
    let start: Date;
    switch (preset) {
      case "today":
        start = new Date(now);
        break;
      case "7d":
        start = new Date(now);
        start.setDate(start.getDate() - 7);
        break;
      case "30d":
        start = new Date(now);
        start.setDate(start.getDate() - 30);
        break;
      case "month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "prevMonth":
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        setStartDate(toLocalDate(start));
        setEndDate(toLocalDate(end));
        return;
      default:
        return;
    }
    setStartDate(toLocalDate(start));
    setEndDate(toLocalDate(now));
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">
          📊 Analityka
        </h2>
        {data?.overview.activeSessions !== undefined &&
          data.overview.activeSessions > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              {data.overview.activeSessions} aktywn
              {data.overview.activeSessions === 1
                ? "a sesja"
                : data.overview.activeSessions < 5
                  ? "e sesje"
                  : "ych sesji"}
            </div>
          )}
      </div>

      {/* ═══════════ DATE CONTROLS ═══════════ */}
      <div className="flex gap-2 flex-wrap items-center">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
        />
        <span className="text-[hsl(var(--muted-foreground))]">–</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
        />
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value)}
          className="h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
        >
          <option value="day">Dziennie</option>
          <option value="week">Tygodniowo</option>
          <option value="month">Miesięcznie</option>
        </select>

        <div className="flex gap-1">
          {[
            ["today", "Dziś"],
            ["7d", "7 dni"],
            ["30d", "30 dni"],
            ["month", "Ten miesiąc"],
            ["prevMonth", "Prev. miesiąc"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPreset(key)}
              className="h-9 px-3 rounded-lg border border-[hsl(var(--border))] text-xs hover:bg-[hsl(var(--accent))] transition-colors"
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={fetchData}
          className="h-9 px-4 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-medium"
        >
          Odśwież
        </button>
      </div>

      {/* ═══════════ TABS ═══════════ */}
      <div className="flex gap-1 border-b border-[hsl(var(--border))]">
        {(
          [
            ["overview", "Przegląd"],
            ["sources", "Źródła ruchu"],
            ["funnel", "Lejek konwersji"],
            ["pages", "Strony & Produkty"],
            ["sessions", "Sesje"],
            ["errors404", "🚨 Błędy 404"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key
                ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]"
                : "border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ═══════════ LOADING / ERROR ═══════════ */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-3 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* ═══════════ TAB CONTENT ═══════════ */}
      {data && !loading && (
        <>
          {tab === "overview" && <OverviewTab data={data} />}
          {tab === "sources" && <SourcesTab data={data} />}
          {tab === "funnel" && <FunnelTab data={data} />}
          {tab === "pages" && (
            <PagesTab data={data} topProducts={topProducts} />
          )}
          {tab === "sessions" && (
            <SessionsTab
              sessions={sessions}
              loading={sessionsLoading}
              page={sessionsPage}
              totalPages={sessionsTotalPages}
              total={sessionsTotal}
              source={sessionsSource}
              ordered={sessionsOrdered}
              onSourceChange={(v) => {
                setSessionsSource(v);
              }}
              onOrderedChange={(v) => {
                setSessionsOrdered(v);
              }}
              onPageChange={(p) => fetchSessions(p)}
              expandedSession={expandedSession}
              onToggleSession={(id) =>
                setExpandedSession(expandedSession === id ? null : id)
              }
            />
          )}
          {tab === "errors404" && (
            <NotFoundTab data={notFoundData} loading={notFoundLoading} />
          )}
        </>
      )}
    </div>
  );
}

// ============================================
// 404 ERRORS TAB
// ============================================
function NotFoundTab({
  data,
  loading,
}: {
  data: NotFoundData | null;
  loading: boolean;
}) {
  const [urlFilter, setUrlFilter] = useState("");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-3 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
        Brak danych
      </div>
    );
  }

  const filteredUrls = urlFilter
    ? data.topUrls.filter(
        (u) => u.url.includes(urlFilter) || u.pattern.includes(urlFilter),
      )
    : data.topUrls;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Łącznie 404"
          value={String(data.total)}
          warn={data.total > 50}
        />
        <KpiCard
          label="Wewnętrzne"
          value={String(data.totalInternal)}
          warn={data.totalInternal > 0}
        />
        <KpiCard label="Zewnętrzne" value={String(data.totalExternal)} />
        <KpiCard label="Bezpośrednie" value={String(data.totalDirect)} />
      </div>

      {/* Internal broken links alert */}
      {data.brokenInternalLinks.length > 0 && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800">
          <h3 className="font-bold text-sm text-red-700 dark:text-red-400 mb-3 flex items-center gap-2">
            🚨 Wewnętrzne broken links — napraw w pierwszej kolejności!
          </h3>
          <div className="space-y-2">
            {data.brokenInternalLinks.map((bl) => (
              <div
                key={bl.sourcePage}
                className="flex items-start gap-3 text-sm"
              >
                <span className="font-mono text-xs bg-red-100 dark:bg-red-900/40 px-2 py-1 rounded shrink-0">
                  {bl.count}×
                </span>
                <div>
                  <p className="font-medium">
                    Strona źródłowa:{" "}
                    <a
                      href={bl.sourcePage}
                      target="_blank"
                      className="text-[hsl(var(--primary))] hover:underline font-mono text-xs"
                    >
                      {bl.sourcePage}
                    </a>
                  </p>
                  <p className="text-[hsl(var(--muted-foreground))] text-xs mt-0.5">
                    → linkuje do:{" "}
                    {bl.targets.map((t, i) => (
                      <span key={t}>
                        {i > 0 && ", "}
                        <span className="font-mono">{t}</span>
                      </span>
                    ))}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pattern breakdown */}
      <div className="border border-[hsl(var(--border))] rounded-lg p-4 bg-[hsl(var(--card))]">
        <h3 className="font-semibold text-sm mb-4 text-[hsl(var(--foreground))]">
          Rozkład wg typu (pattern)
        </h3>
        <div className="space-y-2">
          {data.byPattern.map((p) => {
            const maxCount = data.byPattern[0]?.count || 1;
            const width = Math.max((p.count / maxCount) * 100, 3);
            return (
              <div key={p.pattern}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm">
                    {PATTERN_LABELS[p.pattern] || p.pattern}
                  </span>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-bold">{p.count}</span>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">
                      ({fmtPct(p.pct)})
                    </span>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">
                      {p.uniqueUrls} unikalnych
                    </span>
                  </div>
                </div>
                <div className="w-full bg-[hsl(var(--accent))] rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${width}%`,
                      background: PATTERN_COLORS[p.pattern] || "#6366f1",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily 404 chart */}
      {data.daily.length > 0 && (
        <div className="border border-[hsl(var(--border))] rounded-lg p-4 bg-[hsl(var(--card))]">
          <h3 className="font-semibold text-sm mb-4 text-[hsl(var(--foreground))]">
            404 w czasie
          </h3>
          <BarChart
            data={data.daily}
            barKey="count"
            xKey="date"
            barLabel="Błędy 404"
            height={160}
            barColor="#ef4444"
          />
        </div>
      )}

      {/* Top 404 URLs */}
      <div className="border border-[hsl(var(--border))] rounded-lg overflow-hidden bg-[hsl(var(--card))]">
        <div className="px-4 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--accent))]/30 flex items-center justify-between">
          <h3 className="font-semibold text-sm">Top 404 URL-e</h3>
          <input
            type="text"
            placeholder="Filtruj URL / pattern..."
            value={urlFilter}
            onChange={(e) => setUrlFilter(e.target.value)}
            className="h-8 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-xs w-56"
          />
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-[hsl(var(--accent))] sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left">URL</th>
                <th className="px-4 py-2 text-right">Trafień</th>
                <th className="px-4 py-2 text-left">Pattern</th>
                <th className="px-4 py-2 text-left">Źródła</th>
                <th className="px-4 py-2 text-left">Ostatnio</th>
              </tr>
            </thead>
            <tbody>
              {filteredUrls.map((u) => (
                <tr
                  key={u.url}
                  className="border-t border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]/20"
                >
                  <td
                    className="px-4 py-2 font-mono text-xs max-w-[350px] truncate"
                    title={u.url}
                  >
                    {u.url}
                  </td>
                  <td className="px-4 py-2 text-right font-bold">{u.count}</td>
                  <td className="px-4 py-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background:
                          (PATTERN_COLORS[u.pattern] || "#6366f1") + "20",
                        color: PATTERN_COLORS[u.pattern] || "#6366f1",
                      }}
                    >
                      {u.pattern}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-[hsl(var(--muted-foreground))]">
                    {u.sources.slice(0, 3).join(", ")}
                  </td>
                  <td className="px-4 py-2 text-xs text-[hsl(var(--muted-foreground))]">
                    {new Date(u.lastSeen).toLocaleDateString("pl-PL")}
                  </td>
                </tr>
              ))}
              {filteredUrls.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-[hsl(var(--muted-foreground))]"
                  >
                    {data.total === 0
                      ? "Brak 404 — super! 🎉"
                      : "Brak wyników dla filtra"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* External sources + Recent events side by side */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* External sources */}
        {data.externalSources.length > 0 && (
          <div className="border border-[hsl(var(--border))] rounded-lg p-4 bg-[hsl(var(--card))]">
            <h3 className="font-semibold text-sm mb-3 text-[hsl(var(--foreground))]">
              Zewnętrzne źródła 404
            </h3>
            <div className="space-y-1.5">
              {data.externalSources.map((s) => (
                <div
                  key={s.source}
                  className="flex items-center justify-between text-sm py-1 border-b border-[hsl(var(--border))]/50 last:border-0"
                >
                  <span className="font-mono text-xs truncate max-w-[200px]">
                    {s.source}
                  </span>
                  <span className="font-bold text-xs">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent 404 events */}
        <div className="border border-[hsl(var(--border))] rounded-lg p-4 bg-[hsl(var(--card))]">
          <h3 className="font-semibold text-sm mb-3 text-[hsl(var(--foreground))]">
            Ostatnie 404
          </h3>
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {data.recentEvents.map((ev, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-xs py-1.5 border-b border-[hsl(var(--border))]/50 last:border-0"
              >
                <span className="text-[hsl(var(--muted-foreground))] shrink-0">
                  {new Date(ev.createdAt).toLocaleString("pl-PL", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span
                  className={`shrink-0 ${ev.isInternal ? "text-red-500" : "text-[hsl(var(--muted-foreground))]"}`}
                >
                  {ev.isInternal ? "🔴" : "🌐"}
                </span>
                <span
                  className="font-mono truncate max-w-[200px]"
                  title={ev.page}
                >
                  {ev.page}
                </span>
                <span className="shrink-0 px-1.5 py-0.5 rounded bg-[hsl(var(--accent))] text-[10px]">
                  {ev.pattern}
                </span>
              </div>
            ))}
            {data.recentEvents.length === 0 && (
              <p className="text-[hsl(var(--muted-foreground))] text-center py-4">
                Brak 404
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// OVERVIEW TAB
// ============================================
function OverviewTab({ data }: { data: AnalyticsData }) {
  const o = data.overview;
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Sesje"
          value={fmt(o.totalSessions)}
          change={o.sessionsChange}
          prev={o.prevSessions}
        />
        <KpiCard label="Unikalni" value={fmt(o.uniqueVisitors)} />
        <KpiCard label="Odsłony" value={fmt(o.totalPageViews)} />
        <KpiCard
          label="Czas sesji - mediana"
          value={fmtDuration(o.medianDuration)}
          sub={`śr. ${fmtDuration(o.avgDuration)}`}
        />
        <KpiCard
          label="Bounce rate"
          value={fmtPct(o.bounceRate)}
          warn={o.bounceRate > 70}
        />
        <KpiCard
          label="Konwersja"
          value={fmtPct(o.conversionRate)}
          good={o.conversionRate > 2}
        />
        <KpiCard
          label="Zamówienia"
          value={String(o.totalOrders)}
          change={
            o.prevOrders > 0
              ? ((o.totalOrders - o.prevOrders) / o.prevOrders) * 100
              : 0
          }
        />
        <KpiCard
          label="Przychód"
          value={fmtPln(o.totalRevenue)}
          change={o.revenueChange}
          isCurrency
        />
      </div>

      {/* Additional conversion metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MiniCard
          label="Do koszyka"
          value={fmtPct(o.cartRate)}
          sub="sesji z dodaniem"
        />
        <MiniCard
          label="Koszyk → Zamówienie"
          value={fmtPct(o.cartToOrderRate)}
          sub="konwersja koszyka"
        />
        <MiniCard
          label="Śr. wartość zamówienia"
          value={
            o.totalOrders > 0 ? fmtPln(o.totalRevenue / o.totalOrders) : "–"
          }
        />
      </div>

      {/* Time Series Chart */}
      {data.timeSeries.length > 0 && (
        <div className="border border-[hsl(var(--border))] rounded-lg p-4 bg-[hsl(var(--card))]">
          <h3 className="font-semibold text-sm mb-4 text-[hsl(var(--foreground))]">
            Ruch w czasie
          </h3>
          <BarChart
            data={data.timeSeries}
            barKey="sessions"
            lineKey="orders"
            xKey="date"
            barLabel="Sesje"
            lineLabel="Zamówienia"
            height={200}
          />
        </div>
      )}

      {/* Hourly Heatmap */}
      <div className="border border-[hsl(var(--border))] rounded-lg p-4 bg-[hsl(var(--card))]">
        <h3 className="font-semibold text-sm mb-3 text-[hsl(var(--foreground))]">
          Rozkład godzinowy
        </h3>
        <HourlyHeatmap data={data.hourlyDistribution} />
      </div>

      {/* Devices */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border border-[hsl(var(--border))] rounded-lg p-4 bg-[hsl(var(--card))]">
          <h3 className="font-semibold text-sm mb-3 text-[hsl(var(--foreground))]">
            Urządzenia
          </h3>
          {data.devices.map((d) => (
            <div
              key={d.device}
              className="flex items-center justify-between py-2 border-b border-[hsl(var(--border))]/50 last:border-0"
            >
              <div className="flex items-center gap-2">
                <span>{DEVICE_ICONS[d.device] || "❓"}</span>
                <span className="text-sm font-medium">{d.label}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span>
                  {d.sessions} sesji ({fmtPct(d.pct)})
                </span>
                <span className="text-[hsl(var(--muted-foreground))]">
                  {d.orders} zam.
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-[hsl(var(--accent))]">
                  {fmtPct(d.conversionRate)} conv.
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="border border-[hsl(var(--border))] rounded-lg p-4 bg-[hsl(var(--card))]">
          <h3 className="font-semibold text-sm mb-3 text-[hsl(var(--foreground))]">
            Przeglądarki & Systemy
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase mb-2">
                Przeglądarki
              </p>
              {data.browsers.slice(0, 5).map((b) => (
                <div key={b.name} className="flex justify-between text-sm py-1">
                  <span>{b.name}</span>
                  <span className="text-[hsl(var(--muted-foreground))]">
                    {fmtPct(b.pct)}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase mb-2">
                Systemy
              </p>
              {data.operatingSystems.slice(0, 5).map((o) => (
                <div key={o.name} className="flex justify-between text-sm py-1">
                  <span>{o.name}</span>
                  <span className="text-[hsl(var(--muted-foreground))]">
                    {fmtPct(o.pct)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SOURCES TAB
// ============================================
function SourcesTab({ data }: { data: AnalyticsData }) {
  const gp = data.googlePerformance;
  return (
    <div className="space-y-6">
      {/* Google Performance Comparison */}
      <div className="border border-[hsl(var(--border))] rounded-lg p-4 bg-[hsl(var(--card))]">
        <h3 className="font-semibold text-sm mb-4 text-[hsl(var(--foreground))]">
          🔍 Google — porównanie kanałów
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          {(
            [
              ["Shopping", gp.shopping, "#4285F4"],
              ["Organic", gp.organic, "#34A853"],
              ["Ads (CPC)", gp.ads, "#FBBC05"],
            ] as [string, GooglePerfChannel, string][]
          ).map(([label, ch, color]) => (
            <div
              key={label}
              className="p-4 rounded-lg border border-[hsl(var(--border))] relative overflow-hidden"
            >
              <div
                className="absolute top-0 left-0 w-full h-1"
                style={{ background: color }}
              />
              <p className="font-semibold text-sm mb-3" style={{ color }}>
                {label}
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">
                    Sesje
                  </span>
                  <span className="font-medium">{ch.sessions}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">
                    Zamówienia
                  </span>
                  <span className="font-medium">{ch.orders}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">
                    Przychód
                  </span>
                  <span className="font-medium">{fmtPln(ch.revenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">
                    Konwersja
                  </span>
                  <span className="font-medium">
                    {fmtPct(ch.conversionRate)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">
                    Bounce
                  </span>
                  <span className="font-medium">{fmtPct(ch.bounceRate)}</span>
                </div>
                {ch.orders > 0 && (
                  <div className="flex justify-between pt-1 border-t border-[hsl(var(--border))]">
                    <span className="text-[hsl(var(--muted-foreground))]">
                      CPA
                    </span>
                    <span className="font-medium">
                      {fmtPln(ch.revenue / ch.orders)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* All Traffic Sources Table */}
      <div className="border border-[hsl(var(--border))] rounded-lg overflow-hidden bg-[hsl(var(--card))]">
        <div className="px-4 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--accent))]/30">
          <h3 className="font-semibold text-sm text-[hsl(var(--foreground))]">
            Wszystkie źródła ruchu
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[hsl(var(--accent))]">
            <tr>
              <th className="px-4 py-2 text-left">Źródło</th>
              <th className="px-4 py-2 text-right">Sesje</th>
              <th className="px-4 py-2 text-right">%</th>
              <th className="px-4 py-2 text-right">Zamówienia</th>
              <th className="px-4 py-2 text-right">Przychód</th>
              <th className="px-4 py-2 text-right">Konwersja</th>
              <th className="px-4 py-2 text-right">Bounce</th>
            </tr>
          </thead>
          <tbody>
            {data.trafficSources.map((s) => (
              <tr
                key={s.source}
                className="border-t border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]/20"
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ background: SOURCE_COLORS[s.source] || "#888" }}
                    />
                    <span className="font-medium">{s.label}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-right">{s.sessions}</td>
                <td className="px-4 py-2 text-right text-[hsl(var(--muted-foreground))]">
                  {fmtPct(s.pct)}
                </td>
                <td className="px-4 py-2 text-right">{s.orders}</td>
                <td className="px-4 py-2 text-right">{fmtPln(s.revenue)}</td>
                <td className="px-4 py-2 text-right">
                  <span
                    className={s.conversionRate > 2 ? "text-green-600" : ""}
                  >
                    {fmtPct(s.conversionRate)}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <span className={s.bounceRate > 70 ? "text-red-500" : ""}>
                    {fmtPct(s.bounceRate)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Source Distribution Bar */}
      <div className="border border-[hsl(var(--border))] rounded-lg p-4 bg-[hsl(var(--card))]">
        <h3 className="font-semibold text-sm mb-3 text-[hsl(var(--foreground))]">
          Rozkład źródeł
        </h3>
        <div className="flex rounded-full overflow-hidden h-6">
          {data.trafficSources
            .filter((s) => s.pct > 0)
            .map((s) => (
              <div
                key={s.source}
                title={`${s.label}: ${fmtPct(s.pct)}`}
                style={{
                  width: `${Math.max(s.pct, 1)}%`,
                  background: SOURCE_COLORS[s.source] || "#888",
                }}
                className="h-full transition-all hover:opacity-80"
              />
            ))}
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          {data.trafficSources
            .filter((s) => s.pct > 0)
            .map((s) => (
              <div key={s.source} className="flex items-center gap-1.5 text-xs">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: SOURCE_COLORS[s.source] || "#888" }}
                />
                <span>
                  {s.label} ({fmtPct(s.pct)})
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// FUNNEL TAB
// ============================================
function FunnelTab({ data }: { data: AnalyticsData }) {
  const maxCount = Math.max(...data.funnel.map((f) => f.count), 1);
  return (
    <div className="space-y-6">
      <div className="border border-[hsl(var(--border))] rounded-lg p-6 bg-[hsl(var(--card))]">
        <h3 className="font-semibold text-sm mb-6 text-[hsl(var(--foreground))]">
          Lejek konwersji
        </h3>
        <div className="space-y-3 max-w-2xl mx-auto">
          {data.funnel.map((step, i) => {
            const width = Math.max((step.count / maxCount) * 100, 8);
            const colors = [
              "#6366f1",
              "#8b5cf6",
              "#a855f7",
              "#d946ef",
              "#22c55e",
            ];
            const dropoff = i > 0 ? data.funnel[i - 1].count - step.count : 0;
            const dropoffPct =
              i > 0 && data.funnel[i - 1].count > 0
                ? ((dropoff / data.funnel[i - 1].count) * 100).toFixed(1)
                : null;

            return (
              <div key={step.step}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{step.step}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">{step.count}</span>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">
                      ({fmtPct(step.pct)})
                    </span>
                    {dropoffPct && (
                      <span className="text-xs text-red-500">
                        -{dropoffPct}% odpływ
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-full bg-[hsl(var(--accent))] rounded-full h-8 overflow-hidden">
                  <div
                    className="h-full rounded-full flex items-center justify-end pr-3 transition-all duration-500"
                    style={{
                      width: `${width}%`,
                      background: colors[i] || colors[0],
                    }}
                  >
                    {width > 15 && (
                      <span className="text-white text-xs font-bold">
                        {step.count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <MiniCard
          label="Sesja → Produkt"
          value={fmtPct(data.funnel[1]?.pct || 0)}
          sub="widzą produkt"
        />
        <MiniCard
          label="Produkt → Koszyk"
          value={
            data.funnel[1]?.count
              ? fmtPct(
                  ((data.funnel[2]?.count || 0) / data.funnel[1].count) * 100,
                )
              : "–"
          }
          sub="dodają do koszyka"
        />
        <MiniCard
          label="Koszyk → Checkout"
          value={
            data.funnel[2]?.count
              ? fmtPct(
                  ((data.funnel[3]?.count || 0) / data.funnel[2].count) * 100,
                )
              : "–"
          }
          sub="rozpoczynają zamówienie"
        />
        <MiniCard
          label="Checkout → Order"
          value={
            data.funnel[3]?.count
              ? fmtPct(
                  ((data.funnel[4]?.count || 0) / data.funnel[3].count) * 100,
                )
              : "–"
          }
          sub="składają zamówienie"
        />
      </div>
    </div>
  );
}

// ============================================
// PAGES & PRODUCTS TAB
// ============================================
function PagesTab({
  data,
  topProducts,
}: {
  data: AnalyticsData;
  topProducts: any[];
}) {
  return (
    <div className="space-y-6">
      <div className="border border-[hsl(var(--border))] rounded-lg overflow-hidden bg-[hsl(var(--card))]">
        <div className="px-4 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--accent))]/30">
          <h3 className="font-semibold text-sm">Top strony wejściowe</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[hsl(var(--accent))]">
              <tr>
                <th className="px-4 py-2 text-left">Strona</th>
                <th className="px-4 py-2 text-right">Sesje</th>
                <th className="px-4 py-2 text-right">Zamówienia</th>
                <th className="px-4 py-2 text-right">Przychód</th>
                <th className="px-4 py-2 text-right">Bounce</th>
                <th className="px-4 py-2 text-right">Konwersja</th>
              </tr>
            </thead>
            <tbody>
              {data.topLandingPages.map((lp) => (
                <tr
                  key={lp.page}
                  className="border-t border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]/20"
                >
                  <td
                    className="px-4 py-2 font-mono text-xs max-w-[300px] truncate"
                    title={lp.page}
                  >
                    {lp.page}
                  </td>
                  <td className="px-4 py-2 text-right">{lp.sessions}</td>
                  <td className="px-4 py-2 text-right">{lp.orders}</td>
                  <td className="px-4 py-2 text-right">{fmtPln(lp.revenue)}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={lp.bounceRate > 70 ? "text-red-500" : ""}>
                      {fmtPct(lp.bounceRate)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span
                      className={lp.conversionRate > 2 ? "text-green-600" : ""}
                    >
                      {fmtPct(lp.conversionRate)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {topProducts.length > 0 && (
        <div className="border border-[hsl(var(--border))] rounded-lg overflow-hidden bg-[hsl(var(--card))]">
          <div className="px-4 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--accent))]/30">
            <h3 className="font-semibold text-sm">
              Najczęściej oglądane produkty
            </h3>
          </div>
          <div className="divide-y divide-[hsl(var(--border))]">
            {topProducts.map((p, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-[hsl(var(--accent))]/20"
              >
                <span className="text-xs text-[hsl(var(--muted-foreground))] w-6">
                  {i + 1}.
                </span>
                {p.image && (
                  <img
                    src={p.image}
                    alt=""
                    className="w-10 h-10 object-contain rounded border border-[hsl(var(--border))]"
                    loading="lazy"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  {p.categorySlug && p.slug && (
                    <a
                      href={`/${p.categorySlug}/${p.slug}`}
                      target="_blank"
                      className="text-xs text-[hsl(var(--primary))] hover:underline"
                    >
                      /{p.categorySlug}/{p.slug}
                    </a>
                  )}
                </div>
                <span className="text-sm font-bold">{p.views} wyświetleń</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// SESSIONS TAB
// ============================================
function SessionsTab({
  sessions,
  loading,
  page,
  totalPages,
  total,
  source,
  ordered,
  onSourceChange,
  onOrderedChange,
  onPageChange,
  expandedSession,
  onToggleSession,
}: {
  sessions: SessionItem[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  source: string;
  ordered: string;
  onSourceChange: (v: string) => void;
  onOrderedChange: (v: string) => void;
  onPageChange: (p: number) => void;
  expandedSession: string | null;
  onToggleSession: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-center">
        <select
          value={source}
          onChange={(e) => {
            onSourceChange(e.target.value);
            onPageChange(0);
          }}
          className="h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
        >
          <option value="">Wszystkie źródła</option>
          <option value="google_shopping">Google Shopping</option>
          <option value="google_organic">Google Organic</option>
          <option value="google_ads">Google Ads</option>
          <option value="direct">Bezpośredni</option>
          <option value="referral">Referral</option>
        </select>
        <select
          value={ordered}
          onChange={(e) => {
            onOrderedChange(e.target.value);
            onPageChange(0);
          }}
          className="h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
        >
          <option value="">Wszystkie sesje</option>
          <option value="true">Z zamówieniem</option>
        </select>
        <span className="text-sm text-[hsl(var(--muted-foreground))]">
          {total} sesji
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="border border-[hsl(var(--border))] rounded-lg overflow-hidden bg-[hsl(var(--card))]">
          <table className="w-full text-sm">
            <thead className="bg-[hsl(var(--accent))]">
              <tr>
                <th className="px-3 py-2 text-left">Źródło</th>
                <th className="px-3 py-2 text-left">Strona wejściowa</th>
                <th className="px-3 py-2 text-left">Urządzenie</th>
                <th className="px-3 py-2 text-right">Strony</th>
                <th className="px-3 py-2 text-right">Czas</th>
                <th className="px-3 py-2 text-center">Ścieżka</th>
                <th className="px-3 py-2 text-left">Data</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <>
                  <tr
                    key={s.id}
                    className={`border-t border-[hsl(var(--border))] cursor-pointer transition-colors ${
                      s.hasOrdered
                        ? "bg-green-50 dark:bg-green-900/10"
                        : "hover:bg-[hsl(var(--accent))]/20"
                    }`}
                    onClick={() => onToggleSession(s.id)}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{
                            background: SOURCE_COLORS[s.source] || "#888",
                          }}
                        />
                        <span className="font-medium text-xs">
                          {s.sourceLabel}
                        </span>
                      </div>
                    </td>
                    <td
                      className="px-3 py-2 font-mono text-xs max-w-[200px] truncate"
                      title={s.landingPage}
                    >
                      {(() => {
                        try {
                          return new URL(s.landingPage, "https://x.com")
                            .pathname;
                        } catch {
                          return s.landingPage;
                        }
                      })()}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {DEVICE_ICONS[s.deviceType] || ""} {s.browser}/{s.os}
                    </td>
                    <td className="px-3 py-2 text-right">{s.pageCount}</td>
                    <td className="px-3 py-2 text-right">
                      {fmtDuration(s.duration)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <FunnelDot active={true} label="Sesja" />
                        <FunnelDot
                          active={s.hasViewedProduct}
                          label="Produkt"
                        />
                        <FunnelDot active={s.hasAddedToCart} label="Koszyk" />
                        <FunnelDot
                          active={s.hasStartedCheckout}
                          label="Checkout"
                        />
                        <FunnelDot active={s.hasOrdered} label="Zamówienie" />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
                      {new Date(s.startedAt).toLocaleString("pl-PL")}
                    </td>
                  </tr>
                  {expandedSession === s.id && (
                    <tr key={`${s.id}-detail`}>
                      <td
                        colSpan={7}
                        className="px-4 py-3 bg-[hsl(var(--accent))]/30"
                      >
                        <SessionDetail session={s} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-[hsl(var(--muted-foreground))]"
                  >
                    Brak sesji
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-between items-center">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 0}
            className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm disabled:opacity-50"
          >
            ← Poprzednia
          </button>
          <span className="text-sm text-[hsl(var(--muted-foreground))]">
            Strona {page + 1} z {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages - 1}
            className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm disabled:opacity-50"
          >
            Następna →
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================
// SESSION DETAIL (expanded row)
// ============================================
function SessionDetail({ session: s }: { session: SessionItem }) {
  return (
    <div className="grid md:grid-cols-3 gap-4 text-xs">
      <div>
        <p className="font-semibold mb-1 text-[hsl(var(--muted-foreground))] uppercase">
          Sesja
        </p>
        <div className="space-y-0.5">
          <p>
            Visitor:{" "}
            <span className="font-mono">{s.visitorId.substring(0, 12)}...</span>
          </p>
          <p>
            Źródło: {s.sourceLabel} / {s.medium}
          </p>
          {s.referrer && <p>Referrer: {s.referrer}</p>}
          {s.gclid && (
            <p>
              GCLID:{" "}
              <span className="font-mono">{s.gclid.substring(0, 20)}...</span>
            </p>
          )}
          {s.srsltid && (
            <p>
              SRSLTID:{" "}
              <span className="font-mono">{s.srsltid.substring(0, 20)}...</span>
            </p>
          )}
          {s.isBounce && <p className="text-red-500 font-medium">⚡ Bounce</p>}
        </div>
      </div>
      <div>
        <p className="font-semibold mb-1 text-[hsl(var(--muted-foreground))] uppercase">
          Konwersja
        </p>
        <div className="space-y-0.5">
          <p>
            Strony: {s.pageCount} | Czas: {fmtDuration(s.duration)}
          </p>
          <p>
            Produkt: {s.hasViewedProduct ? "✅" : "❌"} | Koszyk:{" "}
            {s.hasAddedToCart ? "✅" : "❌"}
          </p>
          <p>
            Checkout: {s.hasStartedCheckout ? "✅" : "❌"} | Zamówienie:{" "}
            {s.hasOrdered ? "✅" : "❌"}
          </p>
          {s.hasOrdered && s.orderValue && (
            <p className="text-green-600 font-bold">
              Wartość: {fmtPln(s.orderValue)}
            </p>
          )}
        </div>
      </div>
      <div>
        <p className="font-semibold mb-1 text-[hsl(var(--muted-foreground))] uppercase">
          Zdarzenia ({s.events.length})
        </p>
        <div className="max-h-32 overflow-y-auto space-y-0.5">
          {s.events.map((ev: any, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[hsl(var(--muted-foreground))]">
                {new Date(ev.createdAt).toLocaleTimeString("pl-PL")}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-[hsl(var(--accent))] text-[10px] font-mono">
                {ev.type}
              </span>
              {ev.page && (
                <span className="truncate max-w-[150px]" title={ev.page}>
                  {ev.page}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// REUSABLE SUB-COMPONENTS
// ============================================

function KpiCard({
  label,
  value,
  change,
  prev,
  good,
  warn,
  isCurrency,
  sub,
}: {
  label: string;
  value: string;
  change?: number;
  prev?: number;
  good?: boolean;
  warn?: boolean;
  isCurrency?: boolean;
  sub?: string;
}) {
  return (
    <div
      className={`p-4 rounded-lg border bg-[hsl(var(--card))] ${
        good
          ? "border-green-300 dark:border-green-800"
          : warn
            ? "border-red-300 dark:border-red-800"
            : "border-[hsl(var(--border))]"
      }`}
    >
      <p className="text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="text-xl font-bold text-[hsl(var(--foreground))]">{value}</p>
      {sub && ( // ← dodaj blok
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
          {sub}
        </p>
      )}
      {change !== undefined && change !== 0 && (
        <p className="text-xs mt-1" style={{ color: changeColor(change) }}>
          {changeArrow(change)} {Math.abs(change).toFixed(1)}% vs prev.
        </p>
      )}
    </div>
  );
}

function MiniCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="p-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
      <p className="text-lg font-bold text-[hsl(var(--foreground))]">{value}</p>
      {sub && (
        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{sub}</p>
      )}
    </div>
  );
}

function FunnelDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center" title={label}>
      <div
        className={`w-3 h-3 rounded-full border-2 ${
          active
            ? "bg-green-500 border-green-500"
            : "bg-transparent border-[hsl(var(--border))]"
        }`}
      />
    </div>
  );
}

// ============================================
// BAR CHART (pure CSS — no dependencies)
// ============================================
function BarChart({
  data,
  barKey,
  lineKey,
  xKey,
  barLabel,
  lineLabel,
  height = 200,
  barColor,
}: {
  data: any[];
  barKey: string;
  lineKey?: string;
  xKey: string;
  barLabel: string;
  lineLabel?: string;
  height?: number;
  barColor?: string;
}) {
  const maxBar = Math.max(...data.map((d) => d[barKey] || 0), 1);
  const maxLine = lineKey
    ? Math.max(...data.map((d) => d[lineKey] || 0), 1)
    : 1;

  return (
    <div>
      <div
        style={{ height, position: "relative" }}
        className="flex items-end gap-px"
      >
        {data.map((d, i) => {
          const barH = ((d[barKey] || 0) / maxBar) * height;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end group relative"
              style={{ minWidth: 0 }}
            >
              <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded px-2 py-1 text-xs shadow-lg whitespace-nowrap">
                <p className="font-medium">{d[xKey]}</p>
                <p>
                  {barLabel}: {d[barKey]}
                </p>
                {lineKey && (
                  <p>
                    {lineLabel}: {d[lineKey]}
                  </p>
                )}
              </div>
              <div
                className="w-full rounded-t transition-all hover:opacity-90"
                style={{
                  height: `${Math.max(barH, 1)}px`,
                  background: barColor || "#818cf8",
                }}
              />
              {lineKey && d[lineKey] > 0 && (
                <div
                  className="absolute w-2 h-2 rounded-full bg-green-500 border border-white"
                  style={{
                    bottom: `${((d[lineKey] || 0) / maxLine) * height}px`,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div
        className="flex mt-1"
        style={{ fontSize: "9px", color: "hsl(var(--muted-foreground))" }}
      >
        {data.map((d, i) => {
          const showLabel =
            data.length <= 14 || i % Math.ceil(data.length / 14) === 0;
          return (
            <div
              key={i}
              className="flex-1 text-center truncate"
              style={{ minWidth: 0 }}
            >
              {showLabel ? d[xKey]?.slice(5) : ""}
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-2 text-xs">
        <div className="flex items-center gap-1">
          <span
            className="w-3 h-3 rounded"
            style={{ background: barColor || "#818cf8" }}
          />
          <span>{barLabel}</span>
        </div>
        {lineKey && lineLabel && (
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-green-500" />
            <span>{lineLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// HOURLY HEATMAP
// ============================================
function HourlyHeatmap({ data }: { data: HourlyPoint[] }) {
  const maxSessions = Math.max(...data.map((d) => d.sessions), 1);

  return (
    <div className="flex gap-1">
      {data.map((d) => {
        const intensity = d.sessions / maxSessions;
        const bg =
          intensity === 0
            ? "hsl(var(--accent))"
            : `rgba(99, 102, 241, ${0.15 + intensity * 0.85})`;
        return (
          <div
            key={d.hour}
            className="flex-1 flex flex-col items-center gap-1 group relative"
          >
            <div
              className="w-full rounded transition-all hover:ring-2 hover:ring-[hsl(var(--primary))]/50"
              style={{ height: "36px", background: bg, minWidth: "12px" }}
              title={`${d.hour}:00 — ${d.sessions} sesji, ${d.orders} zamówień`}
            />
            <span className="text-[9px] text-[hsl(var(--muted-foreground))]">
              {d.hour}
            </span>
          </div>
        );
      })}
    </div>
  );
}
