// backend/src/routes/admin-wysylajnami.ts

import { FastifyInstance } from "fastify";
import {
  createWNShipmentFromOrder,
  cancelWNShipmentForOrder,
} from "../services/wysylajnami-service.js";
import { isWNConnected, getWNOffers } from "../lib/wysylajnami-client.js";

export async function adminWNRoutes(app: FastifyInstance) {
  app.get("/status", async () => {
    const connected = await isWNConnected();
    return { success: true, data: { connected } };
  });

  // Get price offers for weight
  app.post<{ Body: { weightKg: number } }>(
    "/offers",
    async (request, reply) => {
      try {
        const { weightKg } = request.body as any;
        const offers = await getWNOffers(weightKg || 50);
        return { success: true, data: { offers } };
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: err.message });
      }
    },
  );

  // Create shipment
  app.post<{ Params: { orderId: string }; Body: { courierId?: number } }>(
    "/ship/:orderId",
    async (request, reply) => {
      try {
        const { courierId } = (request.body as any) || {};
        const result = await createWNShipmentFromOrder(
          request.params.orderId,
          courierId,
        );
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

  // Cancel shipment
  app.delete<{ Params: { orderId: string } }>(
    "/ship/:orderId",
    async (request, reply) => {
      try {
        const result = await cancelWNShipmentForOrder(request.params.orderId);
        if (!result.success) {
          return reply
            .status(400)
            .send({ success: false, error: result.error });
        }
        return { success: true };
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: err.message });
      }
    },
  );
}
