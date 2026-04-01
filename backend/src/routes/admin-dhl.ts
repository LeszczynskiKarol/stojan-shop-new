// backend/src/routes/admin-dhl.ts

// Admin endpoints for DHL shipment management

import { FastifyInstance } from "fastify";
import {
  createDHLShipmentFromOrder,
  cancelDHLShipmentForOrder,
} from "../services/dhl-service.js";
import { prisma } from "../lib/prisma.js";
import {
  isDHLConnected,
  bookDHLCourier,
  cancelDHLCourier,
} from "../lib/dhl-client.js";

export async function adminDHLRoutes(app: FastifyInstance) {
  // GET /api/admin/dhl/status
  app.get("/status", async () => {
    const connected = await isDHLConnected();
    return { success: true, data: { connected } };
  });

  // POST /api/admin/dhl/ship/:orderId — create DHL shipment
  app.post<{ Params: { orderId: string } }>(
    "/ship/:orderId",
    async (request, reply) => {
      try {
        const result = await createDHLShipmentFromOrder(request.params.orderId);
        if (!result.success) {
          return reply
            .status(400)
            .send({ success: false, error: result.error });
        }
        return { success: true, data: result };
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: err.message });
      }
    },
  );

  // DELETE /api/admin/dhl/ship/:orderId — cancel DHL shipment
  app.delete<{ Params: { orderId: string } }>(
    "/ship/:orderId",
    async (request, reply) => {
      try {
        const result = await cancelDHLShipmentForOrder(request.params.orderId);
        if (!result.success) {
          return reply
            .status(400)
            .send({ success: false, error: result.error });
        }
        return { success: true, message: "Przesyłka DHL anulowana" };
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: err.message });
      }
    },
  );

  // POST /api/admin/dhl/pickup — book courier for DHL shipments
  app.post("/pickup", async (request, reply) => {
    const orders = await prisma.order.findMany({
      where: { status: "shipped" },
    });

    const dhlOrders = orders.filter((o) => {
      const pd = o.paymentDetails as any;
      return pd?.dhl?.shipmentId && !pd?.dhl?.pickup?.orderIds?.length;
    });

    if (dhlOrders.length === 0) {
      return reply.status(400).send({
        success: false,
        error: "Brak przesyłek DHL oczekujących na podjazd kuriera",
      });
    }

    const shipmentIds = dhlOrders.map(
      (o) => (o.paymentDetails as any).dhl.shipmentId,
    );

    const today = new Date().toISOString().split("T")[0];
    const { pickupDate, pickupFrom, pickupTo } = (request.body as any) || {};

    try {
      const result = await bookDHLCourier(
        shipmentIds,
        pickupDate || today,
        pickupFrom || "10:00",
        pickupTo || "18:00",
        "Silniki elektryczne",
      );

      // Save pickup info
      for (const order of dhlOrders) {
        const pd = (order.paymentDetails as any) || {};
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentDetails: {
              ...pd,
              dhl: {
                ...pd.dhl,
                pickup: {
                  orderIds: result.orderIds,
                  pickupDate: pickupDate || today,
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
          orderIds: result.orderIds,
          ordersCount: dhlOrders.length,
          orderNumbers: dhlOrders.map((o) => o.orderNumber),
        },
      };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // POST /api/admin/dhl/pickup/cancel
  app.post("/pickup/cancel", async (request, reply) => {
    const { orderIds } = request.body as any;
    if (!orderIds?.length) {
      return reply.status(400).send({ success: false, error: "Brak orderIds" });
    }

    const cancelled = await cancelDHLCourier(orderIds);
    if (cancelled) {
      // Clear pickup data
      const orders = await prisma.order.findMany({
        where: { status: "shipped" },
      });
      for (const order of orders) {
        const pd = order.paymentDetails as any;
        if (pd?.dhl?.pickup?.orderIds) {
          const { pickup, ...dhlRest } = pd.dhl;
          await prisma.order.update({
            where: { id: order.id },
            data: { paymentDetails: { ...pd, dhl: dhlRest } },
          });
        }
      }
    }

    return { success: cancelled };
  });

  // GET /api/admin/dhl/pickup/status
  app.get("/pickup/status", async () => {
    const orders = await prisma.order.findMany({
      where: { status: "shipped" },
    });

    const withPickup = orders.filter(
      (o) => (o.paymentDetails as any)?.dhl?.pickup?.orderIds?.length,
    );
    const withoutPickup = orders.filter((o) => {
      const pd = o.paymentDetails as any;
      return pd?.dhl?.shipmentId && !pd?.dhl?.pickup?.orderIds?.length;
    });

    return {
      success: true,
      data: {
        pendingPickup: withoutPickup.length,
        scheduledPickup: withPickup.length,
      },
    };
  });

  // POST /api/admin/dhl/price
  app.post("/price", async (request, reply) => {
    try {
      const { weightKg, postalCode, city, insuranceValue } =
        request.body as any;
      const { getDHLPrice } = await import("../lib/dhl-client.js");
      const result = await getDHLPrice(
        weightKg || 50,
        postalCode || "00-001",
        city || "Warszawa",
        insuranceValue,
      );
      if (!result) {
        return reply
          .status(400)
          .send({ success: false, error: "Nie udało się pobrać ceny DHL" });
      }
      return { success: true, data: result };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
