// backend/src/routes/orders.ts
import { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { prisma } from "../lib/prisma.js";
import {
  calculateShippingCost,
  isCodAvailable,
} from "../config/shipping.config.js";
import {
  sendOrderConfirmation,
  sendShipmentNotification,
  sendAdminNewOrderNotification,
  sendAdminShipmentNotification,
  buildEmailDataFromOrder,
} from "../services/emailService.js";
import { uploadInvoiceToS3 } from "../lib/s3.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:4321";

// ============================================
// Helper: generuj numer zamówienia (001/02/2026)
// ============================================
async function generateOrderNumber(): Promise<string> {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear());

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const count = await prisma.order.count({
    where: {
      createdAt: { gte: startOfMonth, lt: endOfMonth },
    },
  });

  const seq = String(count + 1).padStart(3, "0");
  return `${seq}/${month}/${year}`;
}

// ============================================
// ROUTES
// ============================================
export async function orderRoutes(app: FastifyInstance) {
  // ==========================================
  // POST /api/orders/calculate-shipping
  // ==========================================
  app.post("/calculate-shipping", async (request, reply) => {
    try {
      const body = request.body as {
        items: Array<{ productId: string; quantity: number }>;
        paymentMethod: "prepaid" | "cod";
      };

      if (!body.items?.length || !body.paymentMethod) {
        return reply.status(400).send({
          success: false,
          error: "Brak danych (items, paymentMethod)",
        });
      }

      let totalWeight = 0;
      for (const item of body.items) {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: { weight: true },
        });
        if (product?.weight) {
          totalWeight += Number(product.weight) * item.quantity;
        }
      }

      if (body.paymentMethod === "cod" && !isCodAvailable(totalWeight)) {
        return reply.send({
          success: true,
          data: { cost: null, reason: "COD niedostępny dla tej wagi" },
        });
      }

      const cost = calculateShippingCost(totalWeight, body.paymentMethod);

      return reply.send({
        success: true,
        data: {
          cost: cost ?? 0,
          totalWeight,
          paymentMethod: body.paymentMethod,
          codAvailable: isCodAvailable(totalWeight),
        },
      });
    } catch (err: any) {
      app.log.error(err);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ==========================================
  // POST /api/orders — tworzenie zamówienia
  // ==========================================
  app.post("/", async (request, reply) => {
    try {
      const body = request.body as {
        items: Array<{
          productId: string;
          quantity: number;
          name: string;
          price: number;
          image?: string;
          weight?: number;
          slug?: string;
          categorySlug?: string;
        }>;
        shipping: {
          firstName?: string;
          lastName?: string;
          companyName?: string;
          nip?: string;
          email: string;
          phone: string;
          street: string;
          postalCode: string;
          city: string;
          differentShippingAddress?: boolean;
          shippingStreet?: string;
          shippingPostalCode?: string;
          shippingCity?: string;
          notes?: string;
        };
        subtotal: number;
        shippingCost: number;
        total: number;
        totalWeight: number;
        paymentMethod: "prepaid" | "cod";
        returnUrl?: string;
        analyticsSessionId?: string;
      };

      if (!body.items?.length) {
        return reply
          .status(400)
          .send({ success: false, error: "Brak produktów" });
      }
      if (!body.shipping?.email || !body.shipping?.phone) {
        return reply
          .status(400)
          .send({ success: false, error: "Brak danych kontaktowych" });
      }
      if (
        !body.shipping?.street ||
        !body.shipping?.postalCode ||
        !body.shipping?.city
      ) {
        return reply.status(400).send({ success: false, error: "Brak adresu" });
      }

      let verifiedSubtotal = 0;
      for (const item of body.items) {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: { price: true, stock: true, marketplaces: true, name: true },
        });

        if (!product) {
          return reply.status(400).send({
            success: false,
            error: `Produkt "${item.name}" nie istnieje`,
          });
        }

        if (product.stock < item.quantity) {
          return reply.status(400).send({
            success: false,
            error: `Niewystarczająca ilość "${item.name}" (dostępne: ${product.stock})`,
          });
        }

        const mp = product.marketplaces as any;
        const actualPrice = mp?.ownStore?.price ?? Number(product.price);
        verifiedSubtotal += actualPrice * item.quantity;
      }

      const verifiedShipping = calculateShippingCost(
        body.totalWeight,
        body.paymentMethod,
      );
      if (verifiedShipping === null) {
        return reply.status(400).send({
          success: false,
          error: "Brak dostępnej opcji wysyłki dla tej wagi/metody płatności",
        });
      }

      const verifiedTotal = verifiedSubtotal + verifiedShipping;
      const orderNumber = await generateOrderNumber();

      const order = await prisma.order.create({
        data: {
          orderNumber,
          items: body.items,
          shipping: body.shipping,
          subtotal: verifiedSubtotal,
          shippingCost: verifiedShipping,
          total: verifiedTotal,
          totalWeight: body.totalWeight,
          paymentMethod: body.paymentMethod,
          status: "pending",
          isStockReserved: false,
          invoiceUrls: [],
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });

      // === PREPAID → Stripe Checkout ===
      if (body.paymentMethod === "prepaid") {
        const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
          body.items.map((item) => ({
            price_data: {
              currency: "pln",
              product_data: {
                name: item.name,
                ...(item.image ? { images: [item.image] } : {}),
              },
              unit_amount: Math.round(item.price * 100),
            },
            quantity: item.quantity,
          }));

        lineItems.push({
          price_data: {
            currency: "pln",
            product_data: { name: "Wysyłka" },
            unit_amount: Math.round(verifiedShipping * 100),
          },
          quantity: 1,
        });

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card", "p24", "blik"],
          line_items: lineItems,
          mode: "payment",
          success_url: `${FRONTEND_URL}/checkout/sukces?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${FRONTEND_URL}/checkout?stripe_cancel=true`,
          customer_email: body.shipping.email,
          metadata: {
            orderId: order.id,
            orderNumber,
          },
          expires_at: Math.floor(Date.now() / 1000) + 1800,
        });

        await prisma.order.update({
          where: { id: order.id },
          data: { stripeSessionId: session.id },
        });

        return reply.send({
          success: true,
          data: {
            order: { id: order.id, orderNumber },
            checkoutUrl: session.url,
          },
        });
      }

      // === COD → od razu rezerwuj stock ===
      if (body.paymentMethod === "cod") {
        await reserveStock(order.id, body.items);

        const updatedOrder = await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "paid",
            isStockReserved: true,
          },
        });

        try {
          const emailData = buildEmailDataFromOrder(updatedOrder);
          await sendOrderConfirmation(emailData);
          app.log.info(`📧 Email potwierdzenia COD wysłany dla ${orderNumber}`);
          // Admin notification
          await sendAdminNewOrderNotification(emailData);
          app.log.info(`📧 Admin notification wysłany dla ${orderNumber}`);
        } catch (emailErr: any) {
          app.log.error(
            `[EMAIL] COD confirmation failed for ${orderNumber}: ${emailErr.message}`,
          );
        }

        return reply.send({
          success: true,
          data: {
            order: { id: order.id, orderNumber },
          },
        });
      }

      return reply
        .status(400)
        .send({ success: false, error: "Nieznana metoda płatności" });
    } catch (err: any) {
      app.log.error(err);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ==========================================
  // GET /api/orders/:id
  // ==========================================
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    try {
      const order = await prisma.order.findUnique({
        where: { id: request.params.id },
      });

      if (!order) {
        return reply
          .status(404)
          .send({ success: false, error: "Zamówienie nie znalezione" });
      }

      return reply.send({ success: true, data: order });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ==========================================
  // GET /api/orders/by-stripe-session/:sessionId
  // ==========================================
  app.get<{ Params: { sessionId: string } }>(
    "/by-stripe-session/:sessionId",
    async (request, reply) => {
      try {
        const order = await prisma.order.findFirst({
          where: { stripeSessionId: request.params.sessionId },
        });

        if (!order) {
          return reply
            .status(404)
            .send({ success: false, error: "Zamówienie nie znalezione" });
        }

        return reply.send({ success: true, data: order });
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: err.message });
      }
    },
  );

  // ==========================================
  // GET /api/orders — lista (admin)
  // ==========================================
  app.get("/", async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        limit?: string;
        status?: string;
        search?: string;
        dateFrom?: string;
        dateTo?: string;
        hidePending?: string;
        hideCancelled?: string;
        sortField?: string;
        sortDirection?: string;
      };
      const page = Math.max(0, parseInt(query.page || "0"));
      const limit = Math.min(500, parseInt(query.limit || "20"));

      const where: any = { AND: [] };

      if (query.status && query.status !== "all") {
        where.AND.push({ status: query.status });
      }

      const hiddenStatuses: string[] = [];
      if (query.hidePending === "true") hiddenStatuses.push("pending");
      if (query.hideCancelled === "true") hiddenStatuses.push("cancelled");
      if (hiddenStatuses.length > 0) {
        where.AND.push({ status: { notIn: hiddenStatuses } });
      }

      if (query.dateFrom || query.dateTo) {
        const dateCondition: any = {};
        if (query.dateFrom) dateCondition.gte = new Date(query.dateFrom);
        if (query.dateTo) dateCondition.lte = new Date(query.dateTo);
        where.AND.push({ createdAt: dateCondition });
      }

      if (query.search) {
        const s = query.search;
        where.AND.push({
          OR: [
            { orderNumber: { contains: s, mode: "insensitive" } },
            { shipping: { path: ["email"], string_contains: s } },
            { shipping: { path: ["phone"], string_contains: s } },
            { shipping: { path: ["firstName"], string_contains: s } },
            { shipping: { path: ["lastName"], string_contains: s } },
            { shipping: { path: ["companyName"], string_contains: s } },
            { shipping: { path: ["city"], string_contains: s } },
            { shipping: { path: ["nip"], string_contains: s } },
          ],
        });
      }

      if (where.AND.length === 0) delete where.AND;

      const sortField = query.sortField || "createdAt";
      const sortDirection = (query.sortDirection?.toLowerCase() || "desc") as
        | "asc"
        | "desc";
      const validSortFields = ["createdAt", "orderNumber", "total", "status"];
      const orderBy: any = {};
      orderBy[validSortFields.includes(sortField) ? sortField : "createdAt"] =
        sortDirection;

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where: where.AND ? where : undefined,
          orderBy,
          skip: page * limit,
          take: limit,
        }),
        prisma.order.count({ where: where.AND ? where : undefined }),
      ]);

      return reply.send({
        success: true,
        data: {
          orders,
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total,
        },
      });
    } catch (err: any) {
      app.log.error(err);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ==========================================
  // PATCH /api/orders/:id/status
  // ==========================================
  app.patch<{ Params: { id: string }; Body: { status: string } }>(
    "/:id/status",
    async (request, reply) => {
      try {
        const { status } = request.body as { status: string };
        const validStatuses = [
          "pending",
          "paid",
          "shipped",
          "delivered",
          "cancelled",
        ];
        if (!validStatuses.includes(status)) {
          return reply
            .status(400)
            .send({ success: false, error: "Nieprawidłowy status" });
        }

        const order = await prisma.order.update({
          where: { id: request.params.id },
          data: { status: status as any },
        });

        // ═══ SEND SHIPMENT EMAIL when status → "shipped" ═══
        if (status === "shipped") {
          try {
            const emailData = buildEmailDataFromOrder(order);
            const sent = await sendShipmentNotification(emailData);
            app.log.info(
              `📧 Shipment email ${sent ? "sent" : "FAILED"} for #${order.orderNumber}`,
            );
          } catch (emailErr: any) {
            app.log.error(
              `[EMAIL] Shipment notification failed for ${order.orderNumber}: ${emailErr.message}`,
            );
          }
        }

        return reply.send({ success: true, data: order });
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: err.message });
      }
    },
  );

  // ==========================================
  // PATCH /api/orders/:id/invoices
  // ==========================================
  app.patch<{ Params: { id: string } }>(
    "/:id/invoices",
    async (request, reply) => {
      try {
        const { invoiceUrls } = request.body as { invoiceUrls: string[] };

        if (!Array.isArray(invoiceUrls)) {
          return reply
            .status(400)
            .send({ success: false, error: "invoiceUrls musi być tablicą" });
        }

        const order = await prisma.order.update({
          where: { id: request.params.id },
          data: { invoiceUrls },
        });

        return reply.send({ success: true, data: order });
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: err.message });
      }
    },
  );

  // ==========================================
  // POST /api/orders/:id/upload-invoice
  // Upload PDF → S3 (invoices/ prefix), then append to order.invoiceUrls
  // Single request: multipart upload + DB update
  // ==========================================
  app.post<{ Params: { id: string } }>(
    "/:id/upload-invoice",
    async (request, reply) => {
      try {
        const order = await prisma.order.findUnique({
          where: { id: request.params.id },
        });
        if (!order) {
          return reply
            .status(404)
            .send({ success: false, error: "Zamówienie nie znalezione" });
        }

        const parts = request.parts();
        const newUrls: string[] = [];

        for await (const part of parts) {
          if (part.type === "file") {
            const buffer = await part.toBuffer();
            app.log.info(
              `📎 Invoice upload: file="${part.filename}", size=${buffer.length}, mime=${part.mimetype}`,
            );
            app.log.info(
              `📎 S3 config: region=${process.env.AWS_REGION || "eu-central-1"}, bucket=${process.env.AWS_S3_BUCKET || "stojan-shop"}, keyId=${(process.env.AWS_ACCESS_KEY_ID || "").substring(0, 8)}...`,
            );

            try {
              const url = await uploadInvoiceToS3(
                buffer,
                part.filename || "invoice.pdf",
                part.mimetype || "application/octet-stream",
              );
              newUrls.push(url);
              app.log.info(`✅ Invoice uploaded: ${url}`);
            } catch (s3Err: any) {
              app.log.error(`❌ S3 upload failed: ${s3Err.message}`);
              app.log.error(
                `❌ S3 error code: ${s3Err.Code || s3Err.$metadata?.httpStatusCode || "unknown"}`,
              );
              app.log.error(
                `❌ Full S3 error: ${JSON.stringify(s3Err, null, 2)}`,
              );
              return reply.status(500).send({
                success: false,
                error: `S3 upload failed: ${s3Err.message}`,
                s3Code: s3Err.Code || s3Err.$metadata?.httpStatusCode,
              });
            }
          }
        }

        if (!newUrls.length) {
          return reply
            .status(400)
            .send({ success: false, error: "Brak plików" });
        }

        // Append new URLs to existing invoiceUrls
        const currentUrls = (order.invoiceUrls as string[]) || [];
        const updatedUrls = [...currentUrls, ...newUrls];

        const updated = await prisma.order.update({
          where: { id: request.params.id },
          data: { invoiceUrls: updatedUrls },
        });

        return reply.send({
          success: true,
          data: {
            urls: newUrls,
            invoiceUrls: updated.invoiceUrls,
          },
        });
      } catch (err: any) {
        app.log.error(`Invoice upload error: ${err.message}`);
        return reply.status(500).send({ success: false, error: err.message });
      }
    },
  );

  // ==========================================
  // POST /api/orders/:id/cancel
  // ==========================================
  app.post<{
    Params: { id: string };
    Body: { reason: string; cancelledBy?: string };
  }>("/:id/cancel", async (request, reply) => {
    try {
      const { reason, cancelledBy } = request.body as {
        reason: string;
        cancelledBy?: string;
      };
      if (!reason) {
        return reply
          .status(400)
          .send({ success: false, error: "Powód anulowania jest wymagany" });
      }

      const order = await prisma.order.findUnique({
        where: { id: request.params.id },
      });
      if (!order) {
        return reply
          .status(404)
          .send({ success: false, error: "Zamówienie nie znalezione" });
      }

      let stockRestored = false;
      if (order.isStockReserved && order.status !== "cancelled") {
        const items = order.items as Array<{
          productId: string;
          quantity: number;
        }>;
        for (const item of items) {
          try {
            await prisma.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
          } catch (stockErr) {
            console.warn(
              `⚠️ Nie udało się przywrócić stocku dla produktu ${item.productId}:`,
              stockErr,
            );
          }
        }
        stockRestored = true;
      }

      await prisma.order.update({
        where: { id: request.params.id },
        data: {
          status: "cancelled",
          cancellationReason: reason,
          cancelledAt: new Date(),
          cancelledBy: cancelledBy || "admin",
          isStockReserved: false,
        },
      });

      return reply.send({
        success: true,
        message: "Zamówienie anulowane",
        stockRestored,
      });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ==========================================
  // POST /api/orders/cancel-multiple
  // ==========================================
  app.post("/cancel-multiple", async (request, reply) => {
    try {
      const { ids, reason, cancelledBy } = request.body as {
        ids: string[];
        reason: string;
        cancelledBy?: string;
      };

      if (!ids?.length || !reason) {
        return reply
          .status(400)
          .send({ success: false, error: "Brak ids lub reason" });
      }

      for (const id of ids) {
        const order = await prisma.order.findUnique({ where: { id } });
        if (!order || order.status === "cancelled") continue;

        if (order.isStockReserved) {
          const items = order.items as Array<{
            productId: string;
            quantity: number;
          }>;
          for (const item of items) {
            try {
              await prisma.product.update({
                where: { id: item.productId },
                data: { stock: { increment: item.quantity } },
              });
            } catch (stockErr) {
              console.warn(
                `⚠️ Nie udało się przywrócić stocku dla ${item.productId}:`,
                stockErr,
              );
            }
          }
        }

        await prisma.order.update({
          where: { id },
          data: {
            status: "cancelled",
            cancellationReason: reason,
            cancelledAt: new Date(),
            cancelledBy: cancelledBy || "admin",
            isStockReserved: false,
          },
        });
      }

      return reply.send({
        success: true,
        message: `Anulowano ${ids.length} zamówień`,
      });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ==========================================
  // DELETE /api/orders/:id
  // ==========================================
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    try {
      await prisma.order.delete({ where: { id: request.params.id } });
      return reply.send({ success: true, message: "Zamówienie usunięte" });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ==========================================
  // POST /api/orders/delete-multiple
  // ==========================================
  app.post("/delete-multiple", async (request, reply) => {
    try {
      const { ids } = request.body as { ids: string[] };
      if (!ids?.length) {
        return reply.status(400).send({ success: false, error: "Brak ids" });
      }

      await prisma.order.deleteMany({ where: { id: { in: ids } } });
      return reply.send({
        success: true,
        message: `Usunięto ${ids.length} zamówień`,
      });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}

// ============================================
// STOCK RESERVATION
// ============================================
async function reserveStock(
  orderId: string,
  items: Array<{ productId: string; quantity: number }>,
) {
  for (const item of items) {
    try {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { stock: true, name: true },
      });

      if (!product) {
        console.warn(
          `⚠️ reserveStock: produkt ${item.productId} nie istnieje, pomijam`,
        );
        continue;
      }

      if (product.stock < item.quantity) {
        console.warn(
          `⚠️ reserveStock: za mało stocku dla "${product.name}" (ma: ${product.stock}, potrzeba: ${item.quantity})`,
        );
      }

      await prisma.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });

      console.log(
        `✅ reserveStock: "${product.name}" stock ${product.stock} → ${product.stock - item.quantity}`,
      );
    } catch (err) {
      console.error(
        `❌ reserveStock: błąd dla produktu ${item.productId}:`,
        err,
      );
    }
  }
}

export { reserveStock };
