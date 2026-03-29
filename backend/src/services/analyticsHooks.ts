// backend/src/services/analyticsHooks.ts
// v2 — FIX: global dedup by orderId across ALL sessions, better logging
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
      console.log("🔍 [ANALYTICS-HOOK] No visitorId — skipping");
      return;
    }

    const cutoff = new Date(Date.now() - SESSION_TIMEOUT_MS);
    console.log(
      `🔍 [ANALYTICS-HOOK] Looking for session, vid=${params.visitorId.substring(0, 8)}..., cutoff=${cutoff.toISOString()}`,
    );

    const session = await prisma.analyticsSession.findFirst({
      where: {
        visitorId: params.visitorId,
        lastSeenAt: { gte: cutoff },
      },
      orderBy: { lastSeenAt: "desc" },
    });

    if (!session) {
      console.log(
        `🔍 [ANALYTICS-HOOK] ⚠️ No session found for vid=${params.visitorId.substring(0, 8)}... in last 30min. Looking for ANY recent session...`,
      );

      // Fallback: find ANY session for this visitor (not just last 30min)
      // This handles cases where user took longer than 30min on Stripe
      const fallbackSession = await prisma.analyticsSession.findFirst({
        where: {
          visitorId: params.visitorId,
          hasOrdered: false,
        },
        orderBy: { lastSeenAt: "desc" },
      });

      if (fallbackSession) {
        console.log(
          `🔍 [ANALYTICS-HOOK] Found fallback session: ${fallbackSession.id.substring(0, 8)}..., source=${fallbackSession.source}, started=${fallbackSession.startedAt.toISOString()}`,
        );
        await prisma.analyticsSession.update({
          where: { id: fallbackSession.id },
          data: {
            hasOrdered: true,
            orderId: params.orderId,
            orderValue: params.orderValue,
            lastSeenAt: new Date(),
            isBounce: false,
          },
        });
        console.log("🔍 [ANALYTICS-HOOK] Fallback session updated ✅");

        // Create event on fallback session
        await createOrderEventIfMissing(
          fallbackSession.id,
          params.orderId,
          params.orderValue,
        );
        return;
      }

      console.log(
        "🔍 [ANALYTICS-HOOK] ❌ No session found at all for this visitor. Order will only be tracked if frontend fires.",
      );
      return;
    }

    console.log(
      `🔍 [ANALYTICS-HOOK] Found session: ${session.id.substring(0, 8)}..., source=${session.source}, hasOrdered=${session.hasOrdered}`,
    );

    await prisma.analyticsSession.update({
      where: { id: session.id },
      data: {
        hasOrdered: true,
        orderId: params.orderId,
        orderValue: params.orderValue,
        lastSeenAt: new Date(),
        isBounce: false,
      },
    });
    console.log("🔍 [ANALYTICS-HOOK] Session updated ✅");

    await createOrderEventIfMissing(
      session.id,
      params.orderId,
      params.orderValue,
    );
  } catch (err) {
    console.warn("⚠️ Server-side order tracking failed:", err);
  }
}

/**
 * Create order_complete event if it doesn't exist yet for this orderId (global dedup).
 */
async function createOrderEventIfMissing(
  sessionId: string,
  orderId: string,
  orderValue: number,
): Promise<void> {
  // Check GLOBALLY — not just this session
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
