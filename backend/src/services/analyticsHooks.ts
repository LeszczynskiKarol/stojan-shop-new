// backend/src/services/analyticsHooks.ts
import { prisma } from "../lib/prisma.js";

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Server-side order tracking — fallback gdy frontend tracker nie odpali.
 * Wywołaj po każdym pomyślnym zamówieniu (COD + Stripe webhook).
 */
export async function trackOrderServerSide(params: {
  visitorId?: string; // z cookie lub body
  orderId: string;
  orderValue: number;
  userAgent?: string;
}): Promise<void> {
  try {
    if (!params.visitorId) return;

    const cutoff = new Date(Date.now() - SESSION_TIMEOUT_MS);

    // Znajdź najnowszą sesję tego visitora
    const session = await prisma.analyticsSession.findFirst({
      where: {
        visitorId: params.visitorId,
        lastSeenAt: { gte: cutoff },
      },
      orderBy: { lastSeenAt: "desc" },
    });

    if (session) {
      // Aktualizuj sesję — idempotentne (jeśli frontend też odpalił, to nadpisze tymi samymi danymi)
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

      // Dodaj event jeśli nie ma jeszcze order_complete
      const existing = await prisma.analyticsEvent.findFirst({
        where: {
          sessionId: session.id,
          type: "order_complete",
        },
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
      }
    }
  } catch (err) {
    console.warn("⚠️ Server-side order tracking failed:", err);
  }
}
