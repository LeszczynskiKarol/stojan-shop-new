// backend/src/routes/admin-fedex.ts
// Admin endpoints for FedEx shipment management
// All routes are protected (registered inside protectedRoutes scope in index.ts)

import { FastifyInstance } from "fastify";
import {
  createFedExShipmentFromOrder,
  cancelFedExShipmentForOrder,
  getFedExInfoForOrder,
} from "../services/fedex-service.js";
import { prisma } from "../lib/prisma.js";
import {
  isFedExConnected,
  getFedExRates,
  isFedExEligible,
  type FedExRecipient,
} from "../lib/fedex-client.js";
import { FEDEX_MAX_WEIGHT_KG } from "../config/fedex.config.js";

export async function adminFedExRoutes(app: FastifyInstance) {
  // ==========================================
  // GET /api/admin/fedex/status
  // FedEx connection health check
  // ==========================================
  app.get("/status", async () => {
    const connected = await isFedExConnected();
    return {
      success: true,
      data: {
        connected,
        maxWeightKg: FEDEX_MAX_WEIGHT_KG,
      },
    };
  });

  // ==========================================
  // POST /api/admin/fedex/ship/:orderId
  // Create FedEx shipment for an order
  // ==========================================
  app.post<{ Params: { orderId: string } }>(
    "/ship/:orderId",
    async (request, reply) => {
      try {
        const { orderId } = request.params;
        const result = await createFedExShipmentFromOrder(orderId);

        if (!result.success) {
          return reply.status(400).send({
            success: false,
            error: result.error,
          });
        }

        return {
          success: true,
          data: {
            trackingNumber: result.trackingNumber,
            labelUrl: result.labelUrl,
            trackingUrl: `https://www.fedex.com/fedextrack/?trknbr=${result.trackingNumber}`,
          },
        };
      } catch (err: any) {
        app.log.error(`FedEx ship error:`, err);
        return reply.status(500).send({
          success: false,
          error: err.message,
        });
      }
    },
  );

  // ==========================================
  // DELETE /api/admin/fedex/ship/:orderId
  // Cancel FedEx shipment for an order
  // ==========================================
  app.delete<{ Params: { orderId: string } }>(
    "/ship/:orderId",
    async (request, reply) => {
      try {
        const { orderId } = request.params;
        const result = await cancelFedExShipmentForOrder(orderId);

        if (!result.success) {
          return reply.status(400).send({
            success: false,
            error: result.error,
          });
        }

        return { success: true, message: "Przesyłka FedEx anulowana" };
      } catch (err: any) {
        app.log.error(`FedEx cancel error:`, err);
        return reply.status(500).send({
          success: false,
          error: err.message,
        });
      }
    },
  );

  // ==========================================
  // GET /api/admin/fedex/order/:orderId
  // Get FedEx shipment info for an order
  // ==========================================
  app.get<{ Params: { orderId: string } }>(
    "/order/:orderId",
    async (request, reply) => {
      try {
        const { orderId } = request.params;
        const info = await getFedExInfoForOrder(orderId);
        return { success: true, data: info };
      } catch (err: any) {
        return reply.status(500).send({
          success: false,
          error: err.message,
        });
      }
    },
  );

  // ==========================================
  // POST /api/admin/fedex/rates
  // Get FedEx rate quote for given weight + destination
  // ==========================================
  app.post<{
    Body: {
      postalCode: string;
      countryCode?: string;
      weightKg: number;
    };
  }>("/rates", async (request, reply) => {
    try {
      const { postalCode, countryCode = "PL", weightKg } = request.body;

      if (!postalCode || !weightKg) {
        return reply.status(400).send({
          success: false,
          error: "postalCode i weightKg są wymagane",
        });
      }

      if (!isFedExEligible(weightKg)) {
        return reply.status(400).send({
          success: false,
          error: `Waga ${weightKg} kg przekracza limit FedEx (${FEDEX_MAX_WEIGHT_KG} kg)`,
        });
      }

      const recipient: FedExRecipient = {
        personName: "Rate Check",
        phoneNumber: "000000000",
        street: "ul. Testowa 1",
        city: "Warszawa",
        postalCode,
        countryCode,
      };

      const rates = await getFedExRates(recipient, weightKg);

      return {
        success: true,
        data: { rates, weightKg, postalCode, countryCode },
      };
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: err.message,
      });
    }
  });

  // ==========================================
  // POST /api/admin/fedex/check-eligibility
  // Quick check if an order is FedEx-eligible
  // ==========================================
  app.post<{ Body: { orderId: string } }>(
    "/check-eligibility",
    async (request, reply) => {
      try {
        const { orderId } = request.body;
        const info = await getFedExInfoForOrder(orderId);
        return {
          success: true,
          data: {
            eligible: info.eligible,
            alreadyShipped: info.hasFedEx,
            maxWeightKg: FEDEX_MAX_WEIGHT_KG,
          },
        };
      } catch (err: any) {
        return reply.status(500).send({
          success: false,
          error: err.message,
        });
      }
    },
  );

  // ==========================================
  // POST /api/admin/fedex/pickup
  // Zamów podjazd kuriera (dla wszystkich gotowych przesyłek)
  // ==========================================
  app.post<{
    Body: {
      readyTime?: string;
      closeTime?: string;
    };
  }>("/pickup", async (request, reply) => {
    const { createFedExPickup } = await import("../lib/fedex-client.js");

    // Znajdź wszystkie zamówienia shipped z FedEx, bez pickup
    const orders = await prisma.order.findMany({
      where: { status: "shipped" },
    });

    const fedexOrders = orders.filter((o) => {
      const pd = o.paymentDetails as any;
      return pd?.fedex?.trackingNumber && !pd?.fedex?.pickup?.confirmationCode;
    });

    if (fedexOrders.length === 0) {
      return reply.status(400).send({
        success: false,
        error: "Brak przesyłek FedEx oczekujących na podjazd kuriera",
      });
    }

    // Oblicz łączną wagę
    const totalWeight = fedexOrders.reduce(
      (sum, o) => sum + (Number(o.totalWeight) || 0),
      0,
    );

    // Domyślne czasy: gotowy za 30 min, zamknięcie za 4h
    const now = new Date();
    const readyDate = new Date(now.getTime() + 30 * 60 * 1000);
    const closeDate = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    const readyTime =
      (request.body as any)?.readyTime || readyDate.toISOString();
    const closeTime =
      (request.body as any)?.closeTime || closeDate.toISOString();

    try {
      const result = await createFedExPickup(
        readyTime,
        closeTime,
        fedexOrders.length,
        totalWeight,
      );

      // Zapisz pickup data we WSZYSTKICH zamówieniach
      for (const order of fedexOrders) {
        const pd = (order.paymentDetails as any) || {};
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentDetails: {
              ...pd,
              fedex: {
                ...pd.fedex,
                pickup: {
                  confirmationCode: result.pickupConfirmationCode,
                  pickupDate: result.pickupDate,
                  location: result.location,
                  createdAt: new Date().toISOString(),
                },
              },
            },
          },
        });
      }

      return {
        success: true,
        data: {
          confirmationCode: result.pickupConfirmationCode,
          pickupDate: result.pickupDate,
          ordersCount: fedexOrders.length,
          totalWeight,
          orderNumbers: fedexOrders.map((o) => o.orderNumber),
        },
      };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ==========================================
  // POST /api/admin/fedex/pickup/cancel
  // Anuluj podjazd kuriera
  // ==========================================
  app.post("/pickup/cancel", async (request, reply) => {
    const { cancelFedExPickup } = await import("../lib/fedex-client.js");
    const { confirmationCode, pickupDate, location } = request.body as any;

    if (!confirmationCode) {
      return reply
        .status(400)
        .send({ success: false, error: "Brak confirmationCode" });
    }

    const cancelled = await cancelFedExPickup(
      confirmationCode,
      pickupDate,
      location,
    );

    if (cancelled) {
      // Wyczyść pickup data ze zamówień
      const orders = await prisma.order.findMany({
        where: { status: "shipped" },
      });
      for (const order of orders) {
        const pd = order.paymentDetails as any;
        if (pd?.fedex?.pickup?.confirmationCode === confirmationCode) {
          const { pickup, ...fedexRest } = pd.fedex;
          await prisma.order.update({
            where: { id: order.id },
            data: {
              paymentDetails: { ...pd, fedex: fedexRest },
            },
          });
        }
      }
    }

    return {
      success: cancelled,
      error: cancelled ? undefined : "Nie udało się anulować podjazdu",
    };
  });

  // ==========================================
  // GET /api/admin/fedex/pickup/status
  // Sprawdź czy jest aktywny pickup
  // ==========================================
  app.get("/pickup/status", async () => {
    const orders = await prisma.order.findMany({
      where: { status: "shipped" },
    });

    const withPickup = orders.filter(
      (o) => (o.paymentDetails as any)?.fedex?.pickup?.confirmationCode,
    );
    const withoutPickup = orders.filter((o) => {
      const pd = o.paymentDetails as any;
      return pd?.fedex?.trackingNumber && !pd?.fedex?.pickup?.confirmationCode;
    });

    return {
      success: true,
      data: {
        pendingPickup: withoutPickup.length,
        scheduledPickup: withPickup.length,
        activePickup: withPickup[0]
          ? (withPickup[0].paymentDetails as any).fedex.pickup
          : null,
      },
    };
  });

  // POST /api/admin/fedex/price
  app.post("/price", async (request, reply) => {
    try {
      const { weightKg, postalCode, city } = request.body as any;
      const recipient: FedExRecipient = {
        personName: "Rate Check",
        phoneNumber: "000000000",
        street: "ul. Testowa 1",
        city: city || "Warszawa",
        postalCode: postalCode || "00-001",
        countryCode: "PL",
      };
      const rates = await getFedExRates(recipient, weightKg || 10);
      return { success: true, data: { rates } };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
