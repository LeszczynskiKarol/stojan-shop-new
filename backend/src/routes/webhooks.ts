// backend/src/routes/webhooks.ts
import { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { prisma } from "../lib/prisma.js";
import { trackOrderServerSide } from "../services/analyticsHooks.js";
import { reserveStock } from "./orders.js";
import {
  sendOrderConfirmation,
  sendAdminNewOrderNotification,
  buildEmailDataFromOrder,
} from "../services/emailService.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

export async function webhookRoutes(app: FastifyInstance) {
  // =====================================================
  // WAŻNE: Stripe wymaga raw body do weryfikacji podpisu.
  // Ten content type parser działa TYLKO w scope tego pluginu,
  // nie wpływa na resztę aplikacji.
  // =====================================================
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => {
      done(null, body);
    },
  );

  // ==========================================
  // POST /api/webhooks/stripe
  // ==========================================
  app.post("/stripe", async (request, reply) => {
    const sig = request.headers["stripe-signature"] as string;
    const rawBody = request.body as Buffer;

    if (!sig || !rawBody) {
      return reply.status(400).send({ error: "Brak podpisu lub body" });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
    } catch (err: any) {
      app.log.error(`Stripe webhook signature failed: ${err.message}`);
      return reply.status(400).send({ error: `Webhook Error: ${err.message}` });
    }

    app.log.info(`Stripe event: ${event.type} (${event.id})`);

    try {
      switch (event.type) {
        // ==========================================
        // PŁATNOŚĆ ZAKOŃCZONA SUKCESEM
        // ==========================================
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const orderId = session.metadata?.orderId;

          if (!orderId) {
            app.log.error(
              "checkout.session.completed: brak orderId w metadata",
            );
            break;
          }

          const order = await prisma.order.findUnique({
            where: { id: orderId },
          });

          if (!order) {
            app.log.error(`Order ${orderId} nie znaleziony`);
            break;
          }

          // Nie przetwarzaj ponownie
          if (order.status !== "pending") {
            app.log.info(
              `Order ${orderId} już przetworzony (status: ${order.status})`,
            );
            break;
          }

          // Rezerwuj stock
          const items = order.items as Array<{
            productId: string;
            quantity: number;
          }>;
          await reserveStock(orderId, items);

          // Aktualizuj status
          const updatedOrder = await prisma.order.update({
            where: { id: orderId },
            data: {
              status: "paid",
              isStockReserved: true,
              paymentIntentId:
                typeof session.payment_intent === "string"
                  ? session.payment_intent
                  : (session.payment_intent?.id ?? null),
              paymentDetails: {
                stripeSessionId: session.id,
                paymentIntent:
                  typeof session.payment_intent === "string"
                    ? session.payment_intent
                    : (session.payment_intent?.id ?? null),
                paymentStatus: session.payment_status,
                customerEmail: session.customer_email,
                amountTotal: session.amount_total,
                paidAt: new Date().toISOString(),
              },
            },
          });

          app.log.info(`✅ Order ${order.orderNumber} opłacony (Stripe)`);
          // ▶ Notify SEO Panel
          try {
            const { notifySeoPanelWebhook } = await import("./orders.js");
            await notifySeoPanelWebhook(updatedOrder.createdAt);
          } catch (e: any) {
            app.log.warn(`SEO Panel webhook failed: ${e.message}`);
          }
          // ▶ Server-side analytics tracking
          const webhookVisitorId = session.metadata?.visitorId;
          app.log.info(
            `🔍 [WEBHOOK] Analytics tracking: orderId=${order.id}, visitorId=${webhookVisitorId ? webhookVisitorId.substring(0, 8) + "..." : "MISSING"}, orderNumber=${order.orderNumber}`,
          );
          trackOrderServerSide({
            visitorId: session.metadata?.visitorId,
            orderId: order.id,
            orderValue: Number(updatedOrder.total),
            userAgent: request.headers["user-agent"] || undefined,
          });

          // Wyślij email potwierdzenia
          try {
            const emailData = buildEmailDataFromOrder(updatedOrder);
            await sendOrderConfirmation(emailData);
            app.log.info(
              `📧 Email potwierdzenia wysłany dla ${order.orderNumber}`,
            );
            await sendAdminNewOrderNotification(emailData);
            app.log.info(
              `📧 Admin notification wysłany dla ${order.orderNumber}`,
            );
          } catch (emailErr: any) {
            app.log.error(
              `[EMAIL] Stripe confirmation failed for ${order.orderNumber}: ${emailErr.message}`,
            );
            // Nie blokuj — email to bonus, zamówienie jest już opłacone
          }

          break;
        }

        // ==========================================
        // SESJA WYGASŁA (klient nie zapłacił)
        // ==========================================
        case "checkout.session.expired": {
          const session = event.data.object as Stripe.Checkout.Session;
          const orderId = session.metadata?.orderId;

          if (!orderId) break;

          const order = await prisma.order.findUnique({
            where: { id: orderId },
          });

          if (!order || order.status !== "pending") break;

          await prisma.order.update({
            where: { id: orderId },
            data: {
              status: "cancelled",
              cancellationReason: "Sesja płatności wygasła",
              cancelledAt: new Date(),
              cancelledBy: "system",
            },
          });

          app.log.info(
            `❌ Order ${order.orderNumber} anulowany (sesja wygasła)`,
          );

          try {
            await prisma.analyticsSession.updateMany({
              where: { orderId },
              data: { hasOrdered: false, orderId: null, orderValue: null },
            });
          } catch (e) {
            console.warn("⚠️ Analytics reset failed:", e);
          }
          break;
        }

        default:
          app.log.info(`Nieobsługiwany event: ${event.type}`);
      }
    } catch (err: any) {
      app.log.error(`Błąd obsługi webhooka: ${err.message}`);
      // Zwracamy 200 żeby Stripe nie ponawiał
      return reply.status(200).send({ received: true, error: err.message });
    }

    return reply.send({ received: true });
  });
}
