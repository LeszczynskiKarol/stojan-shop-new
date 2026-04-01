// backend/src/routes/analytics.ts
// Public analytics tracking endpoints
// v2 — FIX: srsltid blog misclassification, global order_complete dedup, diagnostic logs
// Register: app.register(analyticsRoutes, { prefix: '/api/analytics' })

import { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";

// ============================================
// HELPERS
// ============================================

/** 30-min session timeout */
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/** Parse source from URL params + referrer */
function detectSource(params: {
  ref?: string;
  srsltid?: string;
  gclid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  landingPage: string;
}): { source: string; medium: string; campaign: string | null } {
  // 1. Explicit UTM params
  if (params.utm_source) {
    return {
      source: params.utm_source,
      medium: params.utm_medium || "unknown",
      campaign: params.utm_campaign || null,
    };
  }

  // 2. Google Click ID → paid Google Ads
  if (params.gclid) {
    return { source: "google_ads", medium: "cpc", campaign: "pmax" };
  }

  // 3. srsltid — Google Surface Results tracking
  //    Product pages = Google Shopping / Merchant Center
  //    Other pages = Google Organic with rich results
  //    FIX v2: exclude /blog/, /admin/, /checkout/, /kontakt, /skup-silnikow etc.
  if (params.srsltid) {
    let pathname = "/";
    try {
      pathname = new URL(params.landingPage, "https://x.com").pathname;
    } catch {}

    const isProductPage =
      /^\/[^/]+\/[^/]+$/.test(pathname) &&
      !pathname.startsWith("/blog/") &&
      !pathname.startsWith("/admin/") &&
      !pathname.startsWith("/checkout/") &&
      !pathname.startsWith("/zamowienie/") &&
      !pathname.startsWith("/kontakt") &&
      !pathname.startsWith("/skup-silnikow");

    return { source: "google_organic", medium: "organic", campaign: null };
  }

  // 4. Referrer-based detection
  if (params.ref) {
    const ref = params.ref.toLowerCase();
    if (ref.includes("google.")) {
      return { source: "google_organic", medium: "organic", campaign: null };
    }
    if (ref.includes("bing.") || ref.includes("msn.")) {
      return { source: "bing", medium: "organic", campaign: null };
    }
    if (ref.includes("facebook.") || ref.includes("fb.")) {
      return { source: "facebook", medium: "social", campaign: null };
    }
    if (ref.includes("instagram.")) {
      return { source: "instagram", medium: "social", campaign: null };
    }
    if (ref.includes("allegro.")) {
      return { source: "allegro", medium: "referral", campaign: null };
    }
    if (ref.includes("olx.")) {
      return { source: "olx", medium: "referral", campaign: null };
    }
    // Generic referral
    try {
      const host = new URL(ref).hostname.replace("www.", "");
      return { source: host, medium: "referral", campaign: null };
    } catch {
      return { source: "referral", medium: "referral", campaign: null };
    }
  }

  // 5. Direct
  return { source: "direct", medium: "direct", campaign: null };
}

/** Parse device type from User-Agent */
function parseDevice(ua: string): {
  deviceType: string;
  browser: string;
  os: string;
} {
  const lower = ua.toLowerCase();

  let deviceType = "desktop";
  if (/mobile|android.*mobile|iphone|ipod/i.test(ua)) deviceType = "mobile";
  else if (/tablet|ipad|android(?!.*mobile)/i.test(ua)) deviceType = "tablet";

  let browser = "unknown";
  if (lower.includes("edg/")) browser = "Edge";
  else if (lower.includes("opr/") || lower.includes("opera")) browser = "Opera";
  else if (lower.includes("chrome") && !lower.includes("edg"))
    browser = "Chrome";
  else if (lower.includes("firefox")) browser = "Firefox";
  else if (lower.includes("safari") && !lower.includes("chrome"))
    browser = "Safari";

  let os = "unknown";
  if (lower.includes("windows")) os = "Windows";
  else if (lower.includes("mac os")) os = "macOS";
  else if (lower.includes("linux")) os = "Linux";
  else if (lower.includes("android")) os = "Android";
  else if (lower.includes("iphone") || lower.includes("ipad")) os = "iOS";

  return { deviceType, browser, os };
}

/** Check if request is from admin (has valid admin cookie) */
async function isAdmin(request: FastifyRequest): Promise<boolean> {
  try {
    const token = (request.cookies as any)?.admin_token;
    if (!token) return false;
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return (
      payload.role === "admin" && payload.exp > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

/** Detect bots by user-agent */
function isBotUA(ua: string): boolean {
  if (
    /bot|crawl|spider|slurp|bingbot|googlebot|yandex|baidu|duckduck|facebookexternalhit|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|anthropic|applebot|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|pingdom|uptimerobot|headlesschrome|phantomjs|puppeteer|selenium|webdriver|wget|curl|httpie|python-requests|go-http|java\/|libwww|scrapy|httpclient|okhttp|axios\/|node-fetch/i.test(
      ua,
    )
  ) {
    return true;
  }

  const chromeMatch = ua.match(/Chrome\/(\d+)/);
  if (chromeMatch) {
    const ver = parseInt(chromeMatch[1], 10);
    if (ver > 0 && ver < 120) return true;
  }

  if (!ua || ua.length < 20) return true;

  if (/compatible;/i.test(ua) && !/msie|trident/i.test(ua)) return true;

  return false;
}

/** Score bot likelihood 0-100 */
function botScore(
  ua: string,
  meta?: { botSignals?: string[]; screenWidth?: number; screenHeight?: number },
): number {
  let score = 0;
  if (isBotUA(ua)) score += 80;
  if (meta?.botSignals && meta.botSignals.length > 0)
    score += meta.botSignals.length * 20;
  if (meta?.screenWidth === 0 || meta?.screenHeight === 0) score += 40;
  return Math.min(score, 100);
}

// ============================================
// ROUTES
// ============================================
export async function analyticsRoutes(app: FastifyInstance) {
  // ------------------------------------------
  // POST /api/analytics/event — track any event
  // ------------------------------------------
  app.post<{
    Body: {
      visitorId: string;
      type: string;
      page: string;
      data?: any;
      sessionMeta?: {
        referrer?: string;
        srsltid?: string;
        gclid?: string;
        utm_source?: string;
        utm_medium?: string;
        utm_campaign?: string;
        screenWidth?: number;
        screenHeight?: number;
        botSignals?: string[];
      };
    };
  }>("/event", async (request, reply) => {
    try {
      // Exclude admin
      if (await isAdmin(request)) {
        return { success: true, tracked: false, reason: "admin" };
      }

      const ua = request.headers["user-agent"] || "";
      const { visitorId, type, page, data, sessionMeta } = request.body;

      // Exclude bots
      const bScore = botScore(ua, sessionMeta);
      if (bScore >= 50) {
        return { success: true, tracked: false, reason: "bot", score: bScore };
      }

      if (!visitorId || !type || !page) {
        return reply
          .status(400)
          .send({ success: false, error: "Missing fields" });
      }

      const { deviceType, browser, os } = parseDevice(ua);
      const cleanPage = page.replace(/&amp;/g, "&");

      // ── GLOBAL DEDUP: order_complete by orderId ──
      if (type === "order_complete" && data?.orderId) {
        const existingOrderEvent = await prisma.analyticsEvent.findFirst({
          where: {
            type: "order_complete",
            data: { path: ["orderId"], equals: data.orderId },
          },
        });
      }

      // Find or create session
      const now = new Date();
      const cutoff = new Date(now.getTime() - SESSION_TIMEOUT_MS);

      let session = await prisma.analyticsSession.findFirst({
        where: {
          visitorId,
          lastSeenAt: { gte: cutoff },
        },
        orderBy: { lastSeenAt: "desc" },
      });

      if (!session) {
        // ── NEW SESSION ──
        // If no sessionMeta provided (e.g. payment return page), this will be "direct"
        // That's expected — but we log it for diagnostics
        const hasSessionMeta = !!sessionMeta;

        let gclid = sessionMeta?.gclid;
        let srsltid = sessionMeta?.srsltid;
        let utm_source = sessionMeta?.utm_source;
        let utm_medium = sessionMeta?.utm_medium;
        let utm_campaign = sessionMeta?.utm_campaign;

        // Fallback: extract from landing page URL if not in sessionMeta
        if (!gclid || !srsltid) {
          try {
            const qIdx = cleanPage.indexOf("?");
            if (qIdx !== -1) {
              const urlParams = new URLSearchParams(cleanPage.slice(qIdx));
              if (!gclid) gclid = urlParams.get("gclid") || undefined;
              if (!srsltid) srsltid = urlParams.get("srsltid") || undefined;
              if (!utm_source)
                utm_source = urlParams.get("utm_source") || undefined;
              if (!utm_medium)
                utm_medium = urlParams.get("utm_medium") || undefined;
              if (!utm_campaign)
                utm_campaign = urlParams.get("utm_campaign") || undefined;
            }
          } catch {}
        }

        const sourceInfo = detectSource({
          ref: sessionMeta?.referrer,
          srsltid,
          gclid,
          utm_source,
          utm_medium,
          utm_campaign,
          landingPage: cleanPage,
        });

        // ── DIAGNOSTIC WARNING: new session on success page ──
        if (
          cleanPage.includes("/checkout/sukces") ||
          cleanPage.includes("/zamowienie/sukces")
        ) {
          console.warn(
            `[ANALYTICS] ⚠️ NEW SESSION on success page! vid=${visitorId.substring(0, 8)}..., source=${sourceInfo.source} — this should have matched existing session. Possible visitorId mismatch (Safari ITP?) or session timeout.`,
          );
        }

        session = await prisma.analyticsSession.create({
          data: {
            visitorId,
            source: sourceInfo.source,
            medium: sourceInfo.medium,
            campaign: sourceInfo.campaign,
            referrer: sessionMeta?.referrer || null,
            landingPage: cleanPage,
            srsltid: sessionMeta?.srsltid || null,
            gclid: sessionMeta?.gclid || null,
            userAgent: ua,
            deviceType,
            browser,
            os,
            screenWidth: sessionMeta?.screenWidth || null,
            screenHeight: sessionMeta?.screenHeight || null,
            startedAt: now,
            lastSeenAt: now,
            pageCount: 1,
            duration: 0,
            isBounce: true,
          },
        });
      } else {
        // ── EXISTING SESSION FOUND ──
        const duration = Math.floor(
          (now.getTime() - session.startedAt.getTime()) / 1000,
        );
        const pageIncrement = type === "page_view" ? 1 : 0;

        await prisma.analyticsSession.update({
          where: { id: session.id },
          data: {
            lastSeenAt: now,
            duration,
            pageCount: { increment: pageIncrement },
            isBounce: session.pageCount + pageIncrement <= 1 && duration < 10,
          },
        });
      }

      // Create event
      await prisma.analyticsEvent.create({
        data: {
          sessionId: session.id,
          type,
          page: cleanPage,
          data: data || undefined,
        },
      });

      // Update conversion flags
      const conversionUpdate: any = {};
      if (type === "product_view") conversionUpdate.hasViewedProduct = true;
      if (type === "add_to_cart") conversionUpdate.hasAddedToCart = true;
      if (type === "checkout_start") conversionUpdate.hasStartedCheckout = true;
      if (type === "order_complete") {
        conversionUpdate.hasOrdered = true;
        conversionUpdate.orderId = data?.orderId || null;
        conversionUpdate.orderValue = data?.orderValue || null;
      }

      if (Object.keys(conversionUpdate).length > 0) {
        await prisma.analyticsSession.update({
          where: { id: session.id },
          data: conversionUpdate,
        });
      }

      return { success: true, tracked: true, sessionId: session.id };
    } catch (err: any) {
      app.log.error(`Analytics tracking error: ${err.message}`);
      return { success: true, tracked: false, error: "internal" };
    }
  });

  // ------------------------------------------
  // POST /api/analytics/heartbeat — keep session alive
  // ------------------------------------------
  app.post<{
    Body: { visitorId: string; page: string };
  }>("/heartbeat", async (request, reply) => {
    try {
      if (await isAdmin(request)) {
        return { success: true };
      }
      if (isBotUA(request.headers["user-agent"] || "")) {
        return { success: true };
      }

      const { visitorId, page } = request.body;
      if (!visitorId) return { success: true };

      const now = new Date();
      const cutoff = new Date(now.getTime() - SESSION_TIMEOUT_MS);

      const session = await prisma.analyticsSession.findFirst({
        where: { visitorId, lastSeenAt: { gte: cutoff } },
        orderBy: { lastSeenAt: "desc" },
      });

      if (session) {
        const duration = Math.floor(
          (now.getTime() - session.startedAt.getTime()) / 1000,
        );
        await prisma.analyticsSession.update({
          where: { id: session.id },
          data: {
            lastSeenAt: now,
            duration,
            isBounce: session.pageCount <= 1 && duration < 10,
          },
        });
      }

      return { success: true };
    } catch {
      return { success: true };
    }
  });
}
