// backend/src/routes/order-stats.ts
// Analytics endpoint — all computations server-side
// Register: app.register(orderStatsRoutes, { prefix: '/api/orders/stats' })

import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { geocodePostalCode } from "../lib/postal-geocode.js";

// ============================================
// HELPERS
// ============================================
const STATUS_LABELS: Record<string, string> = {
  pending: "Oczekujące",
  paid: "Opłacone",
  shipped: "Wysłane",
  delivered: "Dostarczone",
  cancelled: "Anulowane",
};

function getDateKey(date: Date, groupBy: string): string {
  const d = new Date(date);
  if (groupBy === "month") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }
  if (groupBy === "week") {
    // ISO week — snap to Monday
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split("T")[0];
  }
  return d.toISOString().split("T")[0];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================
// ROUTES
// ============================================
export async function orderStatsRoutes(app: FastifyInstance) {
  // ------------------------------------------
  // GET / — comprehensive analytics
  // Query: startDate, endDate, groupBy (day|week|month)
  // ------------------------------------------
  app.get("/", async (request, reply) => {
    const query = request.query as {
      startDate?: string;
      endDate?: string;
      groupBy?: string;
    };

    const now = new Date();
    const endDate = query.endDate ? new Date(query.endDate) : now;
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(now.getFullYear(), now.getMonth(), 1); // default: start of current month
    const groupBy = query.groupBy || "day";

    // Set end to end of day
    endDate.setHours(23, 59, 59, 999);

    // ── Fetch current period orders ──
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: "asc" },
    });

    // ── Fetch previous period for comparison ──
    const periodMs = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - periodMs);
    const prevEnd = new Date(startDate.getTime() - 1);

    const prevOrders = await prisma.order.findMany({
      where: {
        createdAt: { gte: prevStart, lte: prevEnd },
      },
      select: { total: true, status: true },
    });

    // ── Filter: only paid/shipped/delivered for revenue stats ──
    const revenueStatuses = new Set(["paid", "shipped", "delivered"]);
    const activeOrders = orders.filter((o) => revenueStatuses.has(o.status));
    const prevActiveOrders = prevOrders.filter((o) =>
      revenueStatuses.has(o.status),
    );

    // ═══════════════════════════════════════════
    // 1. SUMMARY
    // ═══════════════════════════════════════════
    const totalRevenue = activeOrders.reduce((s, o) => s + Number(o.total), 0);
    const totalOrders = activeOrders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const totalWeight = activeOrders.reduce(
      (s, o) => s + Number(o.totalWeight || 0),
      0,
    );

    const prevRevenue = prevActiveOrders.reduce(
      (s, o) => s + Number(o.total),
      0,
    );
    const prevOrderCount = prevActiveOrders.length;

    const revenueChange =
      prevRevenue > 0
        ? ((totalRevenue - prevRevenue) / prevRevenue) * 100
        : totalRevenue > 0
          ? 100
          : 0;
    const ordersChange =
      prevOrderCount > 0
        ? ((totalOrders - prevOrderCount) / prevOrderCount) * 100
        : totalOrders > 0
          ? 100
          : 0;

    // ═══════════════════════════════════════════
    // 2. TIME SERIES
    // ═══════════════════════════════════════════
    const tsMap = new Map<
      string,
      { revenue: number; orders: number; weight: number }
    >();

    // Pre-fill all dates in range to avoid gaps
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const key = getDateKey(cursor, groupBy);
      if (!tsMap.has(key)) {
        tsMap.set(key, { revenue: 0, orders: 0, weight: 0 });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    for (const order of activeOrders) {
      const key = getDateKey(order.createdAt, groupBy);
      const cur = tsMap.get(key) || { revenue: 0, orders: 0, weight: 0 };
      tsMap.set(key, {
        revenue: cur.revenue + Number(order.total),
        orders: cur.orders + 1,
        weight: cur.weight + Number(order.totalWeight || 0),
      });
    }

    const timeSeries = Array.from(tsMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        revenue: round2(d.revenue),
        orders: d.orders,
        avgValue: d.orders > 0 ? round2(d.revenue / d.orders) : 0,
        weight: round2(d.weight),
      }));

    // ═══════════════════════════════════════════
    // 3. STATUS BREAKDOWN (all orders, including cancelled)
    // ═══════════════════════════════════════════
    const statusMap = new Map<string, { count: number; value: number }>();
    for (const order of orders) {
      const cur = statusMap.get(order.status) || { count: 0, value: 0 };
      statusMap.set(order.status, {
        count: cur.count + 1,
        value: cur.value + Number(order.total),
      });
    }
    const statusBreakdown = Array.from(statusMap.entries()).map(
      ([status, d]) => ({
        status,
        label: STATUS_LABELS[status] || status,
        count: d.count,
        value: round2(d.value),
      }),
    );

    // ═══════════════════════════════════════════
    // 4. PAYMENT METHODS
    // ═══════════════════════════════════════════
    const payMap = new Map<string, { count: number; value: number }>();
    for (const order of activeOrders) {
      const method = order.paymentMethod;
      const label = method === "cod" ? "Pobranie (COD)" : "Online (przedpłata)";
      const cur = payMap.get(label) || { count: 0, value: 0 };
      payMap.set(label, {
        count: cur.count + 1,
        value: cur.value + Number(order.total),
      });
    }
    const payTotal = activeOrders.reduce((s, o) => s + Number(o.total), 0);
    const paymentBreakdown = Array.from(payMap.entries()).map(
      ([method, d]) => ({
        method,
        count: d.count,
        value: round2(d.value),
        pct: payTotal > 0 ? round2((d.value / payTotal) * 100) : 0,
      }),
    );

    // ═══════════════════════════════════════════
    // 5. TOP PRODUCTS
    // ═══════════════════════════════════════════
    const prodMap = new Map<
      string,
      { quantity: number; revenue: number; image?: string }
    >();
    for (const order of activeOrders) {
      const items = (order.items as any[]) || [];
      for (const item of items) {
        const name = item.name || "Nieznany";
        const cur = prodMap.get(name) || { quantity: 0, revenue: 0 };
        prodMap.set(name, {
          quantity: cur.quantity + (item.quantity || 1),
          revenue: cur.revenue + (item.price || 0) * (item.quantity || 1),
          image: cur.image || item.mainImage || item.image,
        });
      }
    }
    const topProducts = Array.from(prodMap.entries())
      .map(([name, d]) => ({
        name,
        quantity: d.quantity,
        revenue: round2(d.revenue),
        image: d.image || null,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // ═══════════════════════════════════════════
    // 6. HOURLY DISTRIBUTION
    // ═══════════════════════════════════════════
    const hourly = new Array(24).fill(0);
    for (const order of activeOrders) {
      hourly[new Date(order.createdAt).getHours()]++;
    }
    const hourlyDistribution = hourly.map((count, hour) => ({ hour, count }));

    // ═══════════════════════════════════════════
    // 7. TOP CITIES
    // ═══════════════════════════════════════════
    const cityMap = new Map<
      string,
      {
        count: number;
        value: number;
        postalCode: string | null;
      }
    >();
    for (const order of activeOrders) {
      const shipping = order.shipping as any;
      const city = (shipping?.city || "Nieznane").trim();
      const cur = cityMap.get(city) || { count: 0, value: 0, postalCode: null };
      cityMap.set(city, {
        count: cur.count + 1,
        value: cur.value + Number(order.total),
        // Keep first postal code seen for this city (for geocoding)
        postalCode: cur.postalCode || shipping?.postalCode || null,
      });
    }
    const topCities = Array.from(cityMap.entries())
      .map(([city, d]) => {
        const coords = geocodePostalCode(d.postalCode || "");
        return {
          city,
          count: d.count,
          value: round2(d.value),
          lat: coords?.[0] ?? null,
          lng: coords?.[1] ?? null,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // ═══════════════════════════════════════════
    // 8. DAY OF WEEK DISTRIBUTION
    // ═══════════════════════════════════════════
    const dayNames = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];
    const dowCounts = new Array(7).fill(0);
    const dowRevenue = new Array(7).fill(0);
    for (const order of activeOrders) {
      const dow = new Date(order.createdAt).getDay();
      dowCounts[dow]++;
      dowRevenue[dow] += Number(order.total);
    }
    const dayOfWeek = dayNames.map((name, i) => ({
      day: name,
      orders: dowCounts[i],
      revenue: round2(dowRevenue[i]),
    }));

    // ═══════════════════════════════════════════
    // 9. BEST DAY
    // ═══════════════════════════════════════════
    let bestDay = { date: "", revenue: 0, orders: 0 };
    for (const ts of timeSeries) {
      if (ts.revenue > bestDay.revenue) {
        bestDay = { date: ts.date, revenue: ts.revenue, orders: ts.orders };
      }
    }

    // ═══════════════════════════════════════════
    // 10. CANCELLATION STATS
    // ═══════════════════════════════════════════
    const cancelledOrders = orders.filter((o) => o.status === "cancelled");
    const cancellationRate =
      orders.length > 0
        ? round2((cancelledOrders.length / orders.length) * 100)
        : 0;
    const cancelledValue = cancelledOrders.reduce(
      (s, o) => s + Number(o.total),
      0,
    );

    // ═══════════════════════════════════════════
    // RESPONSE
    // ═══════════════════════════════════════════
    return {
      success: true,
      data: {
        summary: {
          totalRevenue: round2(totalRevenue),
          totalOrders,
          avgOrderValue: round2(avgOrderValue),
          totalWeight: round2(totalWeight),
          prevRevenue: round2(prevRevenue),
          prevOrders: prevOrderCount,
          revenueChange: round2(revenueChange),
          ordersChange: round2(ordersChange),
          cancellationRate,
          cancelledValue: round2(cancelledValue),
          cancelledCount: cancelledOrders.length,
          allOrdersCount: orders.length,
        },
        bestDay,
        timeSeries,
        statusBreakdown,
        paymentBreakdown,
        topProducts,
        hourlyDistribution,
        topCities,
        dayOfWeek,
      },
    };
  });

  // Dodaj na końcu orderStatsRoutes, przed zamknięciem funkcji

  // ------------------------------------------
  // GET /top-customers — klienci z >= 2 zamówieniami
  // Query: startDate, endDate, minOrders (default 2)
  // ------------------------------------------
  app.get("/top-customers", async (request) => {
    const query = request.query as {
      startDate?: string;
      endDate?: string;
      minOrders?: string;
    };

    const now = new Date();
    const endDate = query.endDate ? new Date(query.endDate) : now;
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date("2025-01-01");
    endDate.setHours(23, 59, 59, 999);
    const minOrders = parseInt(query.minOrders || "2");

    const customers = await prisma.$queryRaw<
      Array<{
        email: string;
        first_name: string;
        last_name: string;
        company_name: string | null;
        city: string;
        order_count: bigint;
        total_revenue: number;
        avg_order_value: number;
        first_order: Date;
        last_order: Date;
        payment_methods: string[];
      }>
    >`
      SELECT
        shipping->>'email' AS email,
        shipping->>'firstName' AS first_name,
        shipping->>'lastName' AS last_name,
        shipping->>'companyName' AS company_name,
        shipping->>'city' AS city,
        COUNT(*)::bigint AS order_count,
        SUM(total::numeric)::float AS total_revenue,
        AVG(total::numeric)::float AS avg_order_value,
        MIN("createdAt") AS first_order,
        MAX("createdAt") AS last_order,
        ARRAY_AGG(DISTINCT payment_method) AS payment_methods
      FROM orders
      WHERE status IN ('paid', 'shipped', 'delivered')
        AND "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
        AND shipping->>'email' IS NOT NULL
        AND shipping->>'email' != ''
      GROUP BY
        shipping->>'email',
        shipping->>'firstName',
        shipping->>'lastName',
        shipping->>'companyName',
        shipping->>'city'
        HAVING COUNT(*) >= ${minOrders}
        ORDER BY COUNT(*) DESC, SUM(total::numeric) DESC
        LIMIT 500
    `;

    const result = customers.map((c) => ({
      email: c.email,
      firstName: c.first_name || "",
      lastName: c.last_name || "",
      companyName: c.company_name || null,
      city: c.city || "",
      orderCount: Number(c.order_count),
      totalRevenue: round2(c.total_revenue),
      avgOrderValue: round2(c.avg_order_value),
      firstOrder: c.first_order,
      lastOrder: c.last_order,
      paymentMethods: c.payment_methods,
    }));

    // Summary stats
    const totalRepeatCustomers = result.length;
    const totalRepeatRevenue = result.reduce((s, c) => s + c.totalRevenue, 0);
    const totalRepeatOrders = result.reduce((s, c) => s + c.orderCount, 0);

    return {
      success: true,
      data: {
        customers: result,
        summary: {
          totalRepeatCustomers,
          totalRepeatRevenue: round2(totalRepeatRevenue),
          totalRepeatOrders,
          avgOrdersPerCustomer:
            totalRepeatCustomers > 0
              ? round2(totalRepeatOrders / totalRepeatCustomers)
              : 0,
          avgRevenuePerCustomer:
            totalRepeatCustomers > 0
              ? round2(totalRepeatRevenue / totalRepeatCustomers)
              : 0,
        },
      },
    };
  });

  // ------------------------------------------
  // GET /customer-orders?email=xxx — zamówienia konkretnego klienta
  // ------------------------------------------
  app.get("/customer-orders", async (request, reply) => {
    const query = request.query as { email?: string };

    if (!query.email) {
      return reply.status(400).send({ success: false, error: "Brak email" });
    }

    const orders = await prisma.order.findMany({
      where: {
        shipping: {
          path: ["email"],
          equals: query.email,
        },
        status: { in: ["paid", "shipped", "delivered", "cancelled"] },
      },
      orderBy: { createdAt: "desc" },
    });

    // Podsumowanie
    const activeOrders = orders.filter((o) =>
      ["paid", "shipped", "delivered"].includes(o.status),
    );
    const totalRevenue = activeOrders.reduce((s, o) => s + Number(o.total), 0);
    const totalWeight = activeOrders.reduce(
      (s, o) => s + Number(o.totalWeight || 0),
      0,
    );

    return {
      success: true,
      data: {
        orders: orders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          paymentMethod: o.paymentMethod,
          items: o.items,
          shipping: o.shipping,
          subtotal: Number(o.subtotal),
          shippingCost: Number(o.shippingCost),
          total: Number(o.total),
          totalWeight: Number(o.totalWeight),
          invoiceUrls: o.invoiceUrls,
          cancellationReason: o.cancellationReason,
          cancelledAt: o.cancelledAt,
          createdAt: o.createdAt,
        })),
        summary: {
          totalOrders: orders.length,
          activeOrders: activeOrders.length,
          cancelledOrders: orders.length - activeOrders.length,
          totalRevenue: round2(totalRevenue),
          avgOrderValue:
            activeOrders.length > 0
              ? round2(totalRevenue / activeOrders.length)
              : 0,
          totalWeight: round2(totalWeight),
        },
      },
    };
  });
}
