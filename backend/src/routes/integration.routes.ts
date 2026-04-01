// backend/src/routes/integration.routes.ts

import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

const API_KEY = process.env.INTEGRATION_API_KEY || "zmien-mnie-na-cos-losowego";

export async function integrationRoutes(fastify: FastifyInstance) {
  fastify.get("/daily-stats", async (request, reply) => {
    const { startDate, endDate, apiKey } = request.query as any;

    if (apiKey !== API_KEY) {
      return reply.code(401).send({ error: "Invalid API key" });
    }
    if (!startDate || !endDate) {
      return reply.code(400).send({ error: "startDate and endDate required" });
    }

    const since = new Date(startDate);
    const until = new Date(endDate + "T23:59:59.999Z");

    // Dzienne zamówienia — opłacone/wysłane/dostarczone
    const orders = await prisma.order.findMany({
      where: {
        status: { in: ["paid", "shipped", "delivered"] },
        createdAt: { gte: since, lte: until },
      },
      select: {
        id: true,
        total: true,
        shippingCost: true,
        subtotal: true,
        status: true,
        paymentMethod: true,
        createdAt: true,
        items: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Agreguj per dzień
    const dailyMap = new Map<
      string,
      {
        date: string;
        orders: number;
        revenue: number;
        shippingRevenue: number;
        avgOrderValue: number;
        prepaidCount: number;
        codCount: number;
      }
    >();

    for (const o of orders) {
      const dateStr = o.createdAt.toISOString().split("T")[0];
      const d = dailyMap.get(dateStr) || {
        date: dateStr,
        orders: 0,
        revenue: 0,
        shippingRevenue: 0,
        avgOrderValue: 0,
        prepaidCount: 0,
        codCount: 0,
      };
      d.orders++;
      d.revenue += Number(o.total);
      d.shippingRevenue += Number(o.shippingCost);
      if (o.paymentMethod === "prepaid") d.prepaidCount++;
      else d.codCount++;
      dailyMap.set(dateStr, d);
    }

    const daily = Array.from(dailyMap.values()).map((d) => ({
      ...d,
      avgOrderValue:
        d.orders > 0 ? Math.round((d.revenue / d.orders) * 100) / 100 : 0,
    }));

    // Totals
    const totalRevenue = orders.reduce((s, o) => s + Number(o.total), 0);
    const totalOrders = orders.length;

    return {
      period: { startDate, endDate },
      totals: {
        revenue: totalRevenue,
        orders: totalOrders,
        avgOrderValue:
          totalOrders > 0
            ? Math.round((totalRevenue / totalOrders) * 100) / 100
            : 0,
      },
      daily,
    };
  });
}
