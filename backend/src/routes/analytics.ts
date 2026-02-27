// backend/src/routes/analytics.ts
// Public analytics tracking endpoints
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
  if (params.srsltid) {
    const isProductPage = /^\/[^/]+\/[^/]+$/.test(
      new URL(params.landingPage, "https://x.com").pathname,
    );
    if (isProductPage) {
      return {
        source: "google_shopping",
        medium: "shopping",
        campaign: "merchant_pmax",
      };
    }
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
    // Simple check — if token exists and is not empty, treat as admin
    // More robust: actually verify the JWT, but this is lightweight
    const { createHmac } = await import("crypto");
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

// ============================================
// ROUTES
// ============================================
export async function analyticsRoutes(app: FastifyInstance) {
  // ------------------------------------------
  // POST /api/analytics/event — track any event
  // Body: { visitorId, type, page, data?, sessionMeta? }
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
      };
    };
  }>("/event", async (request, reply) => {
    try {
      // Exclude admin
      if (await isAdmin(request)) {
        return { success: true, tracked: false, reason: "admin" };
      }

      const { visitorId, type, page, data, sessionMeta } = request.body;
      if (!visitorId || !type || !page) {
        return reply
          .status(400)
          .send({ success: false, error: "Missing fields" });
      }

      const ua = request.headers["user-agent"] || "";
      const { deviceType, browser, os } = parseDevice(ua);

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
        // New session
        const sourceInfo = detectSource({
          ref: sessionMeta?.referrer,
          srsltid: sessionMeta?.srsltid,
          gclid: sessionMeta?.gclid,
          utm_source: sessionMeta?.utm_source,
          utm_medium: sessionMeta?.utm_medium,
          utm_campaign: sessionMeta?.utm_campaign,
          landingPage: page,
        });

        session = await prisma.analyticsSession.create({
          data: {
            visitorId,
            source: sourceInfo.source,
            medium: sourceInfo.medium,
            campaign: sourceInfo.campaign,
            referrer: sessionMeta?.referrer || null,
            landingPage: page,
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
        // Update existing session
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
          page,
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
      // Analytics should never break the UX — always return 200
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
