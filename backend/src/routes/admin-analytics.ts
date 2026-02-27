// backend/src/routes/admin-analytics.ts
// Protected analytics dashboard API
// Register inside protected scope: app.register(adminAnalyticsRoutes, { prefix: '/api/admin/analytics' })

import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

// ============================================
// HELPERS
// ============================================
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getDateKey(date: Date, groupBy: string): string {
  const d = new Date(date);
  if (groupBy === "month") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }
  if (groupBy === "week") {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    return monday.toISOString().split("T")[0];
  }
  return d.toISOString().split("T")[0];
}

const SOURCE_LABELS: Record<string, string> = {
  google_shopping: "Google Shopping",
  google_organic: "Google Organic",
  google_ads: "Google Ads",
  direct: "Bezpośredni",
  referral: "Referral",
  facebook: "Facebook",
  instagram: "Instagram",
  allegro: "Allegro",
  olx: "OLX",
  bing: "Bing",
};

// ============================================
// ROUTES
// ============================================
export async function adminAnalyticsRoutes(app: FastifyInstance) {
  // ------------------------------------------
  // GET / — główny dashboard
  // Query: startDate, endDate, groupBy (day|week|month)
  // ------------------------------------------
  app.get("/", async (request) => {
    const query = request.query as {
      startDate?: string;
      endDate?: string;
      groupBy?: string;
    };

    const now = new Date();
    const endDate = query.endDate ? new Date(query.endDate) : now;
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const groupBy = query.groupBy || "day";
    endDate.setHours(23, 59, 59, 999);

    // Previous period for comparison
    const periodMs = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - periodMs);
    const prevEnd = new Date(startDate.getTime() - 1);

    const [sessions, prevSessions] = await Promise.all([
      prisma.analyticsSession.findMany({
        where: { startedAt: { gte: startDate, lte: endDate } },
        orderBy: { startedAt: "asc" },
      }),
      prisma.analyticsSession.findMany({
        where: { startedAt: { gte: prevStart, lte: prevEnd } },
        select: {
          id: true,
          source: true,
          hasOrdered: true,
          orderValue: true,
          isBounce: true,
          duration: true,
        },
      }),
    ]);

    // ═══════════════════════════════════════════
    // 1. OVERVIEW METRICS
    // ═══════════════════════════════════════════
    const totalSessions = sessions.length;
    const uniqueVisitors = new Set(sessions.map((s) => s.visitorId)).size;
    const totalPageViews = sessions.reduce((s, sess) => s + sess.pageCount, 0);
    const avgDuration =
      totalSessions > 0
        ? sessions.reduce((s, sess) => s + sess.duration, 0) / totalSessions
        : 0;
    const bounceCount = sessions.filter((s) => s.isBounce).length;
    const bounceRate =
      totalSessions > 0 ? (bounceCount / totalSessions) * 100 : 0;

    // Conversions
    const viewedProduct = sessions.filter((s) => s.hasViewedProduct).length;
    const addedToCart = sessions.filter((s) => s.hasAddedToCart).length;
    const startedCheckout = sessions.filter((s) => s.hasStartedCheckout).length;
    const ordered = sessions.filter((s) => s.hasOrdered).length;
    const totalRevenue = sessions
      .filter((s) => s.hasOrdered && s.orderValue)
      .reduce((s, sess) => s + Number(sess.orderValue), 0);

    const conversionRate =
      totalSessions > 0 ? (ordered / totalSessions) * 100 : 0;
    const cartRate =
      totalSessions > 0 ? (addedToCart / totalSessions) * 100 : 0;
    const cartToOrderRate = addedToCart > 0 ? (ordered / addedToCart) * 100 : 0;

    // Previous period
    const prevTotal = prevSessions.length;
    const prevOrdered = prevSessions.filter((s) => s.hasOrdered).length;
    const prevRevenue = prevSessions
      .filter((s) => s.hasOrdered && s.orderValue)
      .reduce((s, sess) => s + Number(sess.orderValue), 0);
    const prevBounce =
      prevTotal > 0
        ? (prevSessions.filter((s) => s.isBounce).length / prevTotal) * 100
        : 0;

    const sessionsChange =
      prevTotal > 0 ? ((totalSessions - prevTotal) / prevTotal) * 100 : 0;
    const revenueChange =
      prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    // ═══════════════════════════════════════════
    // 2. TIME SERIES
    // ═══════════════════════════════════════════
    const tsMap = new Map<
      string,
      {
        sessions: number;
        pageViews: number;
        orders: number;
        revenue: number;
        bounces: number;
        duration: number;
        uniqueVisitors: Set<string>;
      }
    >();

    // Pre-fill dates
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const key = getDateKey(cursor, groupBy);
      if (!tsMap.has(key)) {
        tsMap.set(key, {
          sessions: 0,
          pageViews: 0,
          orders: 0,
          revenue: 0,
          bounces: 0,
          duration: 0,
          uniqueVisitors: new Set(),
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    for (const s of sessions) {
      const key = getDateKey(s.startedAt, groupBy);
      const cur = tsMap.get(key) || {
        sessions: 0,
        pageViews: 0,
        orders: 0,
        revenue: 0,
        bounces: 0,
        duration: 0,
        uniqueVisitors: new Set<string>(),
      };
      cur.sessions++;
      cur.pageViews += s.pageCount;
      cur.duration += s.duration;
      cur.uniqueVisitors.add(s.visitorId);
      if (s.isBounce) cur.bounces++;
      if (s.hasOrdered) {
        cur.orders++;
        cur.revenue += Number(s.orderValue || 0);
      }
      tsMap.set(key, cur);
    }

    const timeSeries = Array.from(tsMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        sessions: d.sessions,
        uniqueVisitors: d.uniqueVisitors.size,
        pageViews: d.pageViews,
        orders: d.orders,
        revenue: round2(d.revenue),
        bounceRate: d.sessions > 0 ? round2((d.bounces / d.sessions) * 100) : 0,
        avgDuration: d.sessions > 0 ? Math.round(d.duration / d.sessions) : 0,
        conversionRate:
          d.sessions > 0 ? round2((d.orders / d.sessions) * 100) : 0,
      }));

    // ═══════════════════════════════════════════
    // 3. TRAFFIC SOURCES
    // ═══════════════════════════════════════════
    const sourceMap = new Map<
      string,
      {
        sessions: number;
        orders: number;
        revenue: number;
        bounces: number;
      }
    >();
    for (const s of sessions) {
      const cur = sourceMap.get(s.source) || {
        sessions: 0,
        orders: 0,
        revenue: 0,
        bounces: 0,
      };
      cur.sessions++;
      if (s.isBounce) cur.bounces++;
      if (s.hasOrdered) {
        cur.orders++;
        cur.revenue += Number(s.orderValue || 0);
      }
      sourceMap.set(s.source, cur);
    }

    const trafficSources = Array.from(sourceMap.entries())
      .map(([source, d]) => ({
        source,
        label: SOURCE_LABELS[source] || source,
        sessions: d.sessions,
        pct: totalSessions > 0 ? round2((d.sessions / totalSessions) * 100) : 0,
        orders: d.orders,
        revenue: round2(d.revenue),
        conversionRate:
          d.sessions > 0 ? round2((d.orders / d.sessions) * 100) : 0,
        bounceRate: d.sessions > 0 ? round2((d.bounces / d.sessions) * 100) : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions);

    // ═══════════════════════════════════════════
    // 4. CONVERSION FUNNEL
    // ═══════════════════════════════════════════
    const funnel = [
      { step: "Sesje", count: totalSessions, pct: 100 },
      {
        step: "Widok produktu",
        count: viewedProduct,
        pct:
          totalSessions > 0 ? round2((viewedProduct / totalSessions) * 100) : 0,
      },
      {
        step: "Dodanie do koszyka",
        count: addedToCart,
        pct:
          totalSessions > 0 ? round2((addedToCart / totalSessions) * 100) : 0,
      },
      {
        step: "Rozpoczęcie zamówienia",
        count: startedCheckout,
        pct:
          totalSessions > 0
            ? round2((startedCheckout / totalSessions) * 100)
            : 0,
      },
      {
        step: "Zamówienie złożone",
        count: ordered,
        pct: totalSessions > 0 ? round2((ordered / totalSessions) * 100) : 0,
      },
    ];

    // ═══════════════════════════════════════════
    // 5. DEVICE BREAKDOWN
    // ═══════════════════════════════════════════
    const deviceMap = new Map<string, { sessions: number; orders: number }>();
    for (const s of sessions) {
      const cur = deviceMap.get(s.deviceType) || { sessions: 0, orders: 0 };
      cur.sessions++;
      if (s.hasOrdered) cur.orders++;
      deviceMap.set(s.deviceType, cur);
    }
    const deviceLabels: Record<string, string> = {
      desktop: "Desktop",
      mobile: "Mobile",
      tablet: "Tablet",
    };
    const devices = Array.from(deviceMap.entries())
      .map(([device, d]) => ({
        device,
        label: deviceLabels[device] || device,
        sessions: d.sessions,
        pct: totalSessions > 0 ? round2((d.sessions / totalSessions) * 100) : 0,
        orders: d.orders,
        conversionRate:
          d.sessions > 0 ? round2((d.orders / d.sessions) * 100) : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions);

    // ═══════════════════════════════════════════
    // 6. TOP LANDING PAGES
    // ═══════════════════════════════════════════
    const lpMap = new Map<
      string,
      { sessions: number; orders: number; revenue: number; bounces: number }
    >();
    for (const s of sessions) {
      // Clean landing page (remove query params)
      let lp: string;
      try {
        lp = new URL(s.landingPage, "https://x.com").pathname;
      } catch {
        lp = s.landingPage;
      }
      const cur = lpMap.get(lp) || {
        sessions: 0,
        orders: 0,
        revenue: 0,
        bounces: 0,
      };
      cur.sessions++;
      if (s.isBounce) cur.bounces++;
      if (s.hasOrdered) {
        cur.orders++;
        cur.revenue += Number(s.orderValue || 0);
      }
      lpMap.set(lp, cur);
    }
    const topLandingPages = Array.from(lpMap.entries())
      .map(([page, d]) => ({
        page,
        sessions: d.sessions,
        orders: d.orders,
        revenue: round2(d.revenue),
        bounceRate: d.sessions > 0 ? round2((d.bounces / d.sessions) * 100) : 0,
        conversionRate:
          d.sessions > 0 ? round2((d.orders / d.sessions) * 100) : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 20);

    // ═══════════════════════════════════════════
    // 7. HOURLY DISTRIBUTION
    // ═══════════════════════════════════════════
    const hourly = new Array(24)
      .fill(null)
      .map(() => ({ sessions: 0, orders: 0 }));
    for (const s of sessions) {
      const h = new Date(s.startedAt).getHours();
      hourly[h].sessions++;
      if (s.hasOrdered) hourly[h].orders++;
    }
    const hourlyDistribution = hourly.map((d, hour) => ({ hour, ...d }));

    // ═══════════════════════════════════════════
    // 8. BROWSER & OS
    // ═══════════════════════════════════════════
    const browserMap = new Map<string, number>();
    const osMap = new Map<string, number>();
    for (const s of sessions) {
      browserMap.set(
        s.browser || "unknown",
        (browserMap.get(s.browser || "unknown") || 0) + 1,
      );
      osMap.set(s.os || "unknown", (osMap.get(s.os || "unknown") || 0) + 1);
    }
    const browsers = Array.from(browserMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        pct: totalSessions > 0 ? round2((count / totalSessions) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
    const operatingSystems = Array.from(osMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        pct: totalSessions > 0 ? round2((count / totalSessions) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // ═══════════════════════════════════════════
    // 9. GOOGLE SHOPPING VS ORGANIC PERFORMANCE
    // ═══════════════════════════════════════════
    const googleShopping = sessions.filter(
      (s) => s.source === "google_shopping",
    );
    const googleOrganic = sessions.filter((s) => s.source === "google_organic");
    const googleAds = sessions.filter((s) => s.source === "google_ads");

    const googlePerformance = {
      shopping: {
        sessions: googleShopping.length,
        orders: googleShopping.filter((s) => s.hasOrdered).length,
        revenue: round2(
          googleShopping
            .filter((s) => s.hasOrdered)
            .reduce((s, sess) => s + Number(sess.orderValue || 0), 0),
        ),
        conversionRate:
          googleShopping.length > 0
            ? round2(
                (googleShopping.filter((s) => s.hasOrdered).length /
                  googleShopping.length) *
                  100,
              )
            : 0,
        bounceRate:
          googleShopping.length > 0
            ? round2(
                (googleShopping.filter((s) => s.isBounce).length /
                  googleShopping.length) *
                  100,
              )
            : 0,
      },
      organic: {
        sessions: googleOrganic.length,
        orders: googleOrganic.filter((s) => s.hasOrdered).length,
        revenue: round2(
          googleOrganic
            .filter((s) => s.hasOrdered)
            .reduce((s, sess) => s + Number(sess.orderValue || 0), 0),
        ),
        conversionRate:
          googleOrganic.length > 0
            ? round2(
                (googleOrganic.filter((s) => s.hasOrdered).length /
                  googleOrganic.length) *
                  100,
              )
            : 0,
        bounceRate:
          googleOrganic.length > 0
            ? round2(
                (googleOrganic.filter((s) => s.isBounce).length /
                  googleOrganic.length) *
                  100,
              )
            : 0,
      },
      ads: {
        sessions: googleAds.length,
        orders: googleAds.filter((s) => s.hasOrdered).length,
        revenue: round2(
          googleAds
            .filter((s) => s.hasOrdered)
            .reduce((s, sess) => s + Number(sess.orderValue || 0), 0),
        ),
        conversionRate:
          googleAds.length > 0
            ? round2(
                (googleAds.filter((s) => s.hasOrdered).length /
                  googleAds.length) *
                  100,
              )
            : 0,
        bounceRate:
          googleAds.length > 0
            ? round2(
                (googleAds.filter((s) => s.isBounce).length /
                  googleAds.length) *
                  100,
              )
            : 0,
      },
    };

    // ═══════════════════════════════════════════
    // 10. REAL-TIME (last 30 min active sessions)
    // ═══════════════════════════════════════════
    const realTimeCutoff = new Date(Date.now() - 30 * 60 * 1000);
    const activeSessions = await prisma.analyticsSession.count({
      where: { lastSeenAt: { gte: realTimeCutoff } },
    });

    // ═══════════════════════════════════════════
    // RESPONSE
    // ═══════════════════════════════════════════
    return {
      success: true,
      data: {
        overview: {
          totalSessions,
          uniqueVisitors,
          totalPageViews,
          avgDuration: Math.round(avgDuration),
          bounceRate: round2(bounceRate),
          conversionRate: round2(conversionRate),
          cartRate: round2(cartRate),
          cartToOrderRate: round2(cartToOrderRate),
          totalOrders: ordered,
          totalRevenue: round2(totalRevenue),
          // Comparison
          prevSessions: prevTotal,
          prevOrders: prevOrdered,
          prevRevenue: round2(prevRevenue),
          sessionsChange: round2(sessionsChange),
          revenueChange: round2(revenueChange),
          // Real-time
          activeSessions,
        },
        funnel,
        timeSeries,
        trafficSources,
        googlePerformance,
        devices,
        topLandingPages,
        hourlyDistribution,
        browsers,
        operatingSystems,
      },
    };
  });

  // ------------------------------------------
  // GET /sessions — lista sesji z paginacją
  // ------------------------------------------
  app.get("/sessions", async (request) => {
    const query = request.query as {
      page?: string;
      limit?: string;
      source?: string;
      hasOrdered?: string;
      startDate?: string;
      endDate?: string;
    };

    const page = Math.max(0, parseInt(query.page || "0"));
    const limit = Math.min(100, parseInt(query.limit || "50"));

    const where: any = {};
    if (query.source) where.source = query.source;
    if (query.hasOrdered === "true") where.hasOrdered = true;
    if (query.startDate || query.endDate) {
      where.startedAt = {};
      if (query.startDate) where.startedAt.gte = new Date(query.startDate);
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        where.startedAt.lte = end;
      }
    }

    const [sessions, total] = await Promise.all([
      prisma.analyticsSession.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: page * limit,
        take: limit,
        include: {
          events: {
            orderBy: { createdAt: "asc" },
            take: 50,
          },
        },
      }),
      prisma.analyticsSession.count({ where }),
    ]);

    return {
      success: true,
      data: {
        sessions: sessions.map((s) => ({
          ...s,
          orderValue: s.orderValue ? Number(s.orderValue) : null,
          sourceLabel: SOURCE_LABELS[s.source] || s.source,
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // ------------------------------------------
  // GET /top-products — most viewed products
  // ------------------------------------------
  app.get("/top-products", async (request) => {
    const query = request.query as {
      startDate?: string;
      endDate?: string;
      limit?: string;
    };
    const now = new Date();
    const endDate = query.endDate ? new Date(query.endDate) : now;
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    endDate.setHours(23, 59, 59, 999);

    const productViews = await prisma.analyticsEvent.findMany({
      where: {
        type: "product_view",
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { data: true },
    });

    const prodMap = new Map<
      string,
      {
        name: string;
        views: number;
        image?: string;
        slug?: string;
        categorySlug?: string;
      }
    >();
    for (const ev of productViews) {
      const d = ev.data as any;
      if (!d?.productName) continue;
      const key = d.productId || d.productName;
      const cur = prodMap.get(key) || {
        name: d.productName,
        views: 0,
        image: d.image,
        slug: d.slug,
        categorySlug: d.categorySlug,
      };
      cur.views++;
      prodMap.set(key, cur);
    }

    const topProducts = Array.from(prodMap.values())
      .sort((a, b) => b.views - a.views)
      .slice(0, parseInt(query.limit || "20"));

    return { success: true, data: topProducts };
  });
}
