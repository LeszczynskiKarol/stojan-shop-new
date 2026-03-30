// backend/src/services/analyticsHooks.ts
// v3 — FIX: create fallback session when visitor has NO sessions at all
// This handles adblockers, JS-disabled browsers, and bot-scored visitors
import { prisma } from "../lib/prisma.js";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Server-side order tracking — fallback gdy frontend tracker nie odpali.
 * Wywołaj po każdym pomyślnym zamówieniu (COD + Stripe webhook).
 */
export async function trackOrderServerSide(params: {
  visitorId?: string;
  orderId: string;
  orderValue: number;
  userAgent?: string;
}): Promise<void> {
  try {
    console.log("🔍 [ANALYTICS-HOOK] Called with:", JSON.stringify(params));

    // ── GLOBAL DEDUP: Check if ANY session already has this orderId ──
    const existingSession = await prisma.analyticsSession.findFirst({
      where: { orderId: params.orderId, hasOrdered: true },
    });
    if (existingSession) {
      console.log(
        `🔍 [ANALYTICS-HOOK] ⚡ DEDUP: orderId=${params.orderId} already assigned to session ${existingSession.id.substring(0, 8)}... (source=${existingSession.source}). Skipping.`,
      );
      return;
    }

    if (!params.visitorId) {
      console.log(
        `🔍 [ANALYTICS-HOOK] No visitorId — creating orphan session for orderId=${params.orderId}`,
      );
      await createFallbackSession(params);
      return;
    }

    const cutoff = new Date(Date.now() - SESSION_TIMEOUT_MS);
    console.log(
      `🔍 [ANALYTICS-HOOK] Looking for session, vid=${params.visitorId.substring(0, 8)}..., cutoff=${cutoff.toISOString()}`,
    );

    // ── TRY 1: Recent session (last 30min) ──
    let session = await prisma.analyticsSession.findFirst({
      where: {
        visitorId: params.visitorId,
        lastSeenAt: { gte: cutoff },
      },
      orderBy: { lastSeenAt: "desc" },
    });

    if (session) {
      console.log(
        `🔍 [ANALYTICS-HOOK] Found session: ${session.id.substring(0, 8)}..., source=${session.source}, hasOrdered=${session.hasOrdered}`,
      );
      await assignOrderToSession(session.id, params);
      return;
    }

    // ── TRY 2: ANY session for this visitor (no time limit) ──
    console.log(
      `🔍 [ANALYTICS-HOOK] ⚠️ No session in last 30min for vid=${params.visitorId.substring(0, 8)}... Looking for ANY session...`,
    );

    session = await prisma.analyticsSession.findFirst({
      where: {
        visitorId: params.visitorId,
        hasOrdered: false,
      },
      orderBy: { lastSeenAt: "desc" },
    });

    if (session) {
      console.log(
        `🔍 [ANALYTICS-HOOK] Found fallback session: ${session.id.substring(0, 8)}..., source=${session.source}, started=${session.startedAt.toISOString()}`,
      );
      await assignOrderToSession(session.id, params);
      return;
    }

    // ── TRY 3: No session at all — CREATE one ──
    console.log(
      `🔍 [ANALYTICS-HOOK] ❌ No session found at all for vid=${params.visitorId.substring(0, 8)}... Creating fallback session.`,
    );
    await createFallbackSession(params);
  } catch (err) {
    console.warn("⚠️ Server-side order tracking failed:", err);
  }
}

/**
 * Assign order to an existing session.
 */
async function assignOrderToSession(
  sessionId: string,
  params: { orderId: string; orderValue: number },
): Promise<void> {
  await prisma.analyticsSession.update({
    where: { id: sessionId },
    data: {
      hasOrdered: true,
      orderId: params.orderId,
      orderValue: params.orderValue,
      lastSeenAt: new Date(),
      isBounce: false,
    },
  });
  console.log("🔍 [ANALYTICS-HOOK] Session updated ✅");

  await createOrderEventIfMissing(sessionId, params.orderId, params.orderValue);
}

/**
 * Create a fallback session + order event when visitor has NO sessions.
 * This happens when: adblocker blocks tracker.js, JS disabled,
 * bot score was too high, or visitor somehow bypassed frontend tracking.
 *
 * Source is set to "server_fallback" so dashboard shows these separately
 * and you can see how many orders your tracker is missing.
 */
async function createFallbackSession(params: {
  visitorId?: string;
  orderId: string;
  orderValue: number;
  userAgent?: string;
}): Promise<void> {
  const now = new Date();

  const session = await prisma.analyticsSession.create({
    data: {
      visitorId: params.visitorId || `server_${params.orderId.substring(0, 8)}`,
      source: "server_fallback",
      medium: "server",
      campaign: null,
      referrer: null,
      landingPage: "/checkout",
      userAgent: params.userAgent || null,
      deviceType: "unknown",
      browser: "unknown",
      os: "unknown",
      startedAt: now,
      lastSeenAt: now,
      duration: 0,
      pageCount: 1,
      isBounce: false,
      hasViewedProduct: true,
      hasAddedToCart: true,
      hasStartedCheckout: true,
      hasOrdered: true,
      orderId: params.orderId,
      orderValue: params.orderValue,
    },
  });

  console.log(
    `🔍 [ANALYTICS-HOOK] 🆕 Fallback session created: ${session.id.substring(0, 8)}..., source=server_fallback, orderId=${params.orderId}, value=${params.orderValue}`,
  );

  await prisma.analyticsEvent.create({
    data: {
      sessionId: session.id,
      type: "order_complete",
      page: "/checkout/sukces",
      data: {
        orderId: params.orderId,
        orderValue: params.orderValue,
        source: "server_fallback",
      },
    },
  });

  console.log(`🔍 [ANALYTICS-HOOK] Fallback event order_complete created ✅`);
}

/**
 * Create order_complete event if it doesn't exist yet for this orderId (global dedup).
 */
async function createOrderEventIfMissing(
  sessionId: string,
  orderId: string,
  orderValue: number,
): Promise<void> {
  const existing = await prisma.analyticsEvent.findFirst({
    where: {
      type: "order_complete",
      data: { path: ["orderId"], equals: orderId },
    },
  });

  if (!existing) {
    await prisma.analyticsEvent.create({
      data: {
        sessionId,
        type: "order_complete",
        page: "/checkout/sukces",
        data: {
          orderId,
          orderValue,
          source: "server",
        },
      },
    });
    console.log(
      `🔍 [ANALYTICS-HOOK] Event order_complete created (source: server, orderId=${orderId}) ✅`,
    );
  } else {
    console.log(
      `🔍 [ANALYTICS-HOOK] ⚡ DEDUP: order_complete event already exists for orderId=${orderId} (eventId=${existing.id.substring(0, 8)}...)`,
    );
  }
}
