// frontend/src/components/admin/OrdersAnalytics.tsx
// Comprehensive order analytics dashboard
// Stack: React + recharts + lucide-react, styled with admin CSS variables

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Package,
  Calendar,
  Clock,
  MapPin,
  BarChart3,
  AlertTriangle,
} from "lucide-react";

const API = (import.meta as any).env?.PUBLIC_API_URL || "http://localhost:4000";

// ============================================
// TYPES
// ============================================
interface Summary {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  totalWeight: number;
  prevRevenue: number;
  prevOrders: number;
  revenueChange: number;
  ordersChange: number;
  cancellationRate: number;
  cancelledValue: number;
  cancelledCount: number;
  allOrdersCount: number;
}

interface TimeSeriesPoint {
  date: string;
  revenue: number;
  orders: number;
  avgValue: number;
  weight: number;
}

interface StatusItem {
  status: string;
  label: string;
  count: number;
  value: number;
}
interface PaymentItem {
  method: string;
  count: number;
  value: number;
  pct: number;
}
interface ProductItem {
  name: string;
  quantity: number;
  revenue: number;
  image: string | null;
}
interface HourlyItem {
  hour: number;
  count: number;
}
interface CityItem {
  city: string;
  count: number;
  value: number;
}
interface DowItem {
  day: string;
  orders: number;
  revenue: number;
}

interface StatsData {
  summary: Summary;
  bestDay: { date: string; revenue: number; orders: number };
  timeSeries: TimeSeriesPoint[];
  statusBreakdown: StatusItem[];
  paymentBreakdown: PaymentItem[];
  topProducts: ProductItem[];
  hourlyDistribution: HourlyItem[];
  topCities: CityItem[];
  dayOfWeek: DowItem[];
}

// ============================================
// HELPERS
// ============================================
const fmt = (v: number) =>
  v.toLocaleString("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const fmtFull = (v: number) =>
  v.toLocaleString("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 2,
  });

const STATUS_COLORS: Record<string, string> = {
  paid: "#22c55e",
  shipped: "#3b82f6",
  delivered: "#a855f7",
  pending: "#f59e0b",
  cancelled: "#ef4444",
};

const CHART_COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
];

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDefaultRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: toISODate(start), end: toISODate(now) };
}

// Presets
const PRESETS = [
  {
    label: "Dziś",
    fn: () => {
      const d = new Date();
      return { start: toISODate(d), end: toISODate(d) };
    },
  },
  {
    label: "7 dni",
    fn: () => {
      const e = new Date();
      const s = new Date(e);
      s.setDate(s.getDate() - 6);
      return { start: toISODate(s), end: toISODate(e) };
    },
  },
  {
    label: "30 dni",
    fn: () => {
      const e = new Date();
      const s = new Date(e);
      s.setDate(s.getDate() - 29);
      return { start: toISODate(s), end: toISODate(e) };
    },
  },
  { label: "Ten miesiąc", fn: () => getDefaultRange() },
  {
    label: "Ostatni miesiąc",
    fn: () => {
      const n = new Date();
      const s = new Date(n.getFullYear(), n.getMonth() - 1, 1);
      const e = new Date(n.getFullYear(), n.getMonth(), 0);
      return { start: toISODate(s), end: toISODate(e) };
    },
  },
  {
    label: "Ten rok",
    fn: () => {
      const n = new Date();
      return { start: `${n.getFullYear()}-01-01`, end: toISODate(n) };
    },
  },
  {
    label: "Wszystko",
    fn: () => ({ start: "2025-02-04", end: toISODate(new Date()) }),
  },
];

// ============================================
// COMPONENT
// ============================================
export default function OrdersAnalytics() {
  const defaults = getDefaultRange();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topCustomers, setTopCustomers] = useState<any>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        groupBy,
      });
      const res = await fetch(`${API}/api/orders/stats?${params}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || "Błąd pobierania statystyk");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, groupBy]);

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams({
          startDate,
          endDate,
          minOrders: "2",
        });
        const res = await fetch(
          `${API}/api/orders/stats/top-customers?${params}`,
        );
        const json = await res.json();
        if (json.success) setTopCustomers(json.data);
      } catch {}
    })();
  }, [startDate, endDate]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    const range = preset.fn();
    setStartDate(range.start);
    setEndDate(range.end);
  };

  // Auto groupBy based on range
  useEffect(() => {
    const days =
      (new Date(endDate).getTime() - new Date(startDate).getTime()) /
      (1000 * 60 * 60 * 24);
    if (days > 180) setGroupBy("month");
    else if (days > 45) setGroupBy("week");
    else setGroupBy("day");
  }, [startDate, endDate]);

  const s = data?.summary;

  // Custom tooltip for charts
  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 12,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
        {payload.map((p: any, i: number) => (
          <div
            key={i}
            style={{
              color: p.color,
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <span>{p.name}:</span>
            <span style={{ fontWeight: 600 }}>
              {typeof p.value === "number" &&
              p.name?.toLowerCase().includes("przychód")
                ? fmt(p.value)
                : p.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ═══ TOOLBAR ═══ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>
          📊 Analityka sprzedaży
        </h1>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="btn btn-outline btn-sm"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ DATE RANGE + GROUP BY ═══ */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <label style={{ fontSize: 13, color: "var(--text-muted)" }}>Od:</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={{ padding: "6px 10px", fontSize: 13 }}
        />
        <label style={{ fontSize: 13, color: "var(--text-muted)" }}>Do:</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          style={{ padding: "6px 10px", fontSize: 13 }}
        />
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as any)}
          style={{ padding: "6px 10px", fontSize: 13 }}
        >
          <option value="day">Dziennie</option>
          <option value="week">Tygodniowo</option>
          <option value="month">Miesięcznie</option>
        </select>
        <button
          onClick={fetchStats}
          className="btn btn-primary btn-sm"
          disabled={loading}
        >
          {loading ? "⏳ Ładowanie..." : "Odśwież"}
        </button>
      </div>

      {error && (
        <div
          style={{
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 8,
            padding: "10px 16px",
            fontSize: 13,
            color: "#f87171",
          }}
        >
          {error}
        </div>
      )}

      {loading && !data && (
        <div
          style={{
            textAlign: "center",
            padding: 60,
            color: "var(--text-muted)",
          }}
        >
          ⏳ Ładowanie statystyk...
        </div>
      )}

      {data && s && (
        <>
          {/* ═══════════ KPI CARDS ═══════════ */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            <KpiCard
              icon={<DollarSign size={18} />}
              label="Przychód"
              value={fmt(s.totalRevenue)}
              change={s.revenueChange}
              subtext={`Poprz. okres: ${fmt(s.prevRevenue)}`}
            />
            <KpiCard
              icon={<ShoppingCart size={18} />}
              label="Zamówienia"
              value={String(s.totalOrders)}
              change={s.ordersChange}
              subtext={`Śr. ${(s.totalOrders / Math.max(data.timeSeries.length, 1)).toFixed(1)} / dzień`}
            />
            <KpiCard
              icon={<Package size={18} />}
              label="Śr. wartość"
              value={fmt(s.avgOrderValue)}
              subtext={`Łączna waga: ${s.totalWeight.toFixed(1)} kg`}
            />
            <KpiCard
              icon={<Calendar size={18} />}
              label="Najlepszy dzień"
              value={fmt(data.bestDay.revenue)}
              subtext={
                data.bestDay.date
                  ? `${new Date(data.bestDay.date).toLocaleDateString("pl-PL")} (${data.bestDay.orders} zam.)`
                  : "—"
              }
            />
            <KpiCard
              icon={<AlertTriangle size={18} />}
              label="Anulowania"
              value={`${s.cancelledCount} (${s.cancellationRate}%)`}
              subtext={`Utracona wartość: ${fmt(s.cancelledValue)}`}
              color={s.cancellationRate > 10 ? "#ef4444" : undefined}
            />
          </div>

          {/* ═══════════ CHARTS ROW 1 ═══════════ */}
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
          >
            {/* Revenue over time */}
            <Card title="Przychód w czasie">
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.timeSeries}>
                    <defs>
                      <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="#6366f1"
                          stopOpacity={0.4}
                        />
                        <stop
                          offset="95%"
                          stopColor="#6366f1"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                      tickFormatter={(d) => {
                        const dt = new Date(d);
                        return `${dt.getDate()}.${dt.getMonth() + 1}`;
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                      tickFormatter={(v) =>
                        v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                      }
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      formatter={(v) => [fmt(Number(v ?? 0)), "Przychód"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Przychód"
                      stroke="#6366f1"
                      strokeWidth={2}
                      fill="url(#gRev)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Orders over time */}
            <Card title="Liczba zamówień">
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.timeSeries}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                      tickFormatter={(d) => {
                        const dt = new Date(d);
                        return `${dt.getDate()}.${dt.getMonth() + 1}`;
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                      allowDecimals={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar
                      dataKey="orders"
                      name="Zamówienia"
                      fill="#22c55e"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* ═══════════ CHARTS ROW 2 ═══════════ */}
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
          >
            {/* Status breakdown pie */}
            <Card title="Podział wg statusów">
              <div
                style={{ height: 300, display: "flex", alignItems: "center" }}
              >
                <ResponsiveContainer width="60%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.statusBreakdown}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={50}
                      label={({ name, value }) => `${name}: ${value}`}
                      labelLine={{ stroke: "var(--text-muted)" }}
                    >
                      {data.statusBreakdown.map((entry) => (
                        <Cell
                          key={entry.status}
                          fill={STATUS_COLORS[entry.status] || "#888"}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, name) => [Number(v ?? 0), String(name)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1, fontSize: 12 }}>
                  {data.statusBreakdown.map((s) => (
                    <div
                      key={s.status}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "4px 0",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: STATUS_COLORS[s.status] || "#888",
                            display: "inline-block",
                          }}
                        />
                        {s.label}
                      </span>
                      <span style={{ fontWeight: 600 }}>
                        {s.count} ({fmt(s.value)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Payment methods */}
            <Card title="Metody płatności">
              <div style={{ padding: "12px 0" }}>
                {data.paymentBreakdown.map((p) => (
                  <div key={p.method} style={{ marginBottom: 16 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 13,
                        marginBottom: 4,
                      }}
                    >
                      <span>{p.method}</span>
                      <span style={{ fontWeight: 600 }}>
                        {fmtFull(p.value)}
                      </span>
                    </div>
                    <div
                      style={{
                        width: "100%",
                        background: "var(--bg)",
                        borderRadius: 4,
                        height: 8,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${p.pct}%`,
                          background: p.method.includes("Online")
                            ? "#6366f1"
                            : "#f59e0b",
                          height: "100%",
                          borderRadius: 4,
                          transition: "width 0.5s",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 11,
                        color: "var(--text-muted)",
                        marginTop: 2,
                      }}
                    >
                      <span>{p.count} zamówień</span>
                      <span>{p.pct.toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* ═══════════ CHARTS ROW 3 ═══════════ */}
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
          >
            {/* Hourly distribution */}
            <Card title="Rozkład godzinowy zamówień">
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.hourlyDistribution}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                      tickFormatter={(h) => `${h}:00`}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      labelFormatter={(h) => `Godzina: ${h}:00`}
                    />
                    <Bar
                      dataKey="count"
                      name="Zamówienia"
                      fill="#fbbf24"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Day of week */}
            <Card title="Zamówienia wg dnia tygodnia">
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.dayOfWeek}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                    />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 12, fill: "var(--text-muted)" }}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                      allowDecimals={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                      tickFormatter={(v) =>
                        v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                      }
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      formatter={(v, name) => [
                        String(name).includes("Przychód")
                          ? fmt(Number(v ?? 0))
                          : Number(v ?? 0),
                        String(name),
                      ]}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="orders"
                      name="Zamówienia"
                      fill="#6366f1"
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="revenue"
                      name="Przychód"
                      fill="#22c55e"
                      radius={[3, 3, 0, 0]}
                      opacity={0.5}
                    />
                    <Legend
                      wrapperStyle={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* ═══════════ TABLES ROW ═══════════ */}
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
          >
            {/* Top products */}
            <Card title="🏆 Top produkty">
              <div>
                {data.topProducts.map((p, i) => (
                  <div
                    key={p.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#fff",
                        flexShrink: 0,
                        background:
                          i === 0
                            ? "#f59e0b"
                            : i === 1
                              ? "#9ca3af"
                              : i === 2
                                ? "#cd7f32"
                                : "var(--border)",
                      }}
                    >
                      {i + 1}
                    </div>
                    {p.image && (
                      <img
                        src={p.image}
                        alt=""
                        style={{
                          width: 36,
                          height: 36,
                          objectFit: "cover",
                          borderRadius: 4,
                          border: "1px solid var(--border)",
                        }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {p.quantity} szt.
                      </div>
                    </div>
                    <div
                      style={{ fontSize: 13, fontWeight: 700, flexShrink: 0 }}
                    >
                      {fmt(p.revenue)}
                    </div>
                  </div>
                ))}
                {data.topProducts.length === 0 && (
                  <div
                    style={{
                      padding: 20,
                      textAlign: "center",
                      color: "var(--text-muted)",
                      fontSize: 13,
                    }}
                  >
                    Brak danych
                  </div>
                )}
              </div>
            </Card>

            {/* Top cities */}
            <Card title="📍 Top miasta">
              <div>
                {data.topCities.map((c, i) => {
                  const maxCount = data.topCities[0]?.count || 1;
                  return (
                    <div
                      key={c.city}
                      style={{
                        padding: "8px 0",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 13,
                          marginBottom: 3,
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>
                          {i + 1}. {c.city}
                        </span>
                        <span style={{ fontWeight: 600 }}>
                          {c.count} zam. • {fmt(c.value)}
                        </span>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          background: "var(--bg)",
                          borderRadius: 3,
                          height: 4,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${(c.count / maxCount) * 100}%`,
                            background: "#3b82f6",
                            height: "100%",
                            borderRadius: 3,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
                {data.topCities.length === 0 && (
                  <div
                    style={{
                      padding: 20,
                      textAlign: "center",
                      color: "var(--text-muted)",
                      fontSize: 13,
                    }}
                  >
                    Brak danych
                  </div>
                )}
              </div>
            </Card>
            {topCustomers && topCustomers.customers.length > 0 && (
              <Card title="👑 Powracający klienci">
                <div>
                  {/* Mini KPI */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: 8,
                      marginBottom: 16,
                      padding: "8px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>
                        {topCustomers.summary.totalRepeatCustomers}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        klientów (≥2 zam.)
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>
                        {fmt(topCustomers.summary.totalRepeatRevenue)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        łączny przychód
                      </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>
                        {topCustomers.summary.avgOrdersPerCustomer.toFixed(1)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        śr. zamówień/klient
                      </div>
                    </div>
                  </div>

                  {/* Lista klientów */}
                  {topCustomers.customers
                    .slice(0, 10)
                    .map((c: any, i: number) => (
                      <div
                        key={c.email}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 0",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#fff",
                            flexShrink: 0,
                            background:
                              i === 0
                                ? "#f59e0b"
                                : i === 1
                                  ? "#9ca3af"
                                  : i === 2
                                    ? "#cd7f32"
                                    : "var(--border)",
                          }}
                        >
                          {i + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {c.companyName || `${c.firstName} ${c.lastName}`}
                          </div>
                          <div
                            style={{ fontSize: 11, color: "var(--text-muted)" }}
                          >
                            {c.city} • {c.email}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>
                            {fmt(c.totalRevenue)}
                          </div>
                          <div
                            style={{ fontSize: 11, color: "var(--text-muted)" }}
                          >
                            {c.orderCount} zam. • śr. {fmt(c.avgOrderValue)}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </Card>
            )}
          </div>

          {/* ═══════════ AVG VALUE OVER TIME ═══════════ */}
          <Card title="Średnia wartość zamówienia w czasie">
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.timeSeries}>
                  <defs>
                    <linearGradient id="gAvg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                    tickFormatter={(d) => {
                      const dt = new Date(d);
                      return `${dt.getDate()}.${dt.getMonth() + 1}`;
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                    tickFormatter={(v) => fmt(v)}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    formatter={(v) => [fmt(Number(v ?? 0)), "Śr. wartość"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="avgValue"
                    name="Śr. wartość"
                    stroke="#a855f7"
                    strokeWidth={2}
                    fill="url(#gAvg)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ============================================
// KPI Card
// ============================================
function KpiCard({
  icon,
  label,
  value,
  change,
  subtext,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  change?: number;
  subtext?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {label}
        </span>
        <span style={{ color: color || "var(--text-muted)" }}>{icon}</span>
      </div>
      <div
        style={{ fontSize: 26, fontWeight: 700, color: color || "var(--text)" }}
      >
        {value}
      </div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
      >
        {change !== undefined && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              fontWeight: 600,
              color: change >= 0 ? "#22c55e" : "#ef4444",
            }}
          >
            {change >= 0 ? (
              <TrendingUp size={13} />
            ) : (
              <TrendingDown size={13} />
            )}
            {change >= 0 ? "+" : ""}
            {change.toFixed(1)}%
          </span>
        )}
        {subtext && (
          <span style={{ color: "var(--text-muted)" }}>{subtext}</span>
        )}
      </div>
    </div>
  );
}

// ============================================
// Card wrapper
// ============================================
function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}
