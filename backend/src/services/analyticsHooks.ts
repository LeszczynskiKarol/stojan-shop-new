// backend/src/services/analyticsHooks.ts
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

    if (!params.visitorId) {
      console.log("🔍 [ANALYTICS-HOOK] No visitorId — skipping");
      return;
    }

    const cutoff = new Date(Date.now() - SESSION_TIMEOUT_MS);
    console.log(
      "🔍 [ANALYTICS-HOOK] Looking for session, visitorId:",
      params.visitorId,
      "cutoff:",
      cutoff.toISOString(),
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
        "🔍 [ANALYTICS-HOOK] No session found for this visitor in last 30min",
      );
      return;
    }

    console.log(
      "🔍 [ANALYTICS-HOOK] Found session:",
      session.id,
      "hasOrdered:",
      session.hasOrdered,
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

    const existing = await prisma.analyticsEvent.findFirst({
      where: { sessionId: session.id, type: "order_complete" },
    });

    if (!existing) {
      await prisma.analyticsEvent.create({
        data: {
          sessionId: session.id,
          type: "order_complete",
          page: "/checkout/sukces",
          data: {
            orderId: params.orderId,
            orderValue: params.orderValue,
            source: "server",
          },
        },
      });
      console.log(
        "🔍 [ANALYTICS-HOOK] Event order_complete created (source: server) ✅",
      );
    } else {
      console.log(
        "🔍 [ANALYTICS-HOOK] Event order_complete already exists (frontend fired first)",
      );
    }
  } catch (err) {
    console.warn("⚠️ Server-side order tracking failed:", err);
  }
}
