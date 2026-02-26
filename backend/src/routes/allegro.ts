// backend/src/routes/allegro.ts
// Allegro admin routes — sync triggers, status, import
// Auth routes (callback, status) are registered as PUBLIC in index.ts
// These routes are PROTECTED by admin auth middleware

import { FastifyInstance } from "fastify";
import { allegroFetch, isAllegroConnected } from "../lib/allegro-client.js";
import {
  syncStockToAllegro,
  syncPriceToAllegro,
  importAllegroOffers,
  fullReconciliation,
  pollAllegroEvents,
} from "../services/allegro-sync.js";
import { prisma } from "../lib/prisma.js";

export async function allegroRoutes(app: FastifyInstance) {
  // ==========================================
  // OAuth (protected — only admins can initiate)
  // ==========================================

  /**
   * GET /api/allegro/auth/url — get OAuth authorization URL
   */
  app.get("/auth/url", async () => {
    const { getAuthUrl } = await import("../lib/allegro-client.js");
    return { success: true, data: { url: getAuthUrl() } };
  });

  // ==========================================
  // Sync Endpoints (admin-triggered)
  // ==========================================

  /**
   * POST /api/allegro/import — import/match all Allegro offers to shop products
   */
  app.post("/import", async (_request, reply) => {
    try {
      const result = await importAllegroOffers();
      return reply.send({
        success: true,
        data: result,
        message: `Zaimportowano: ${result.matched} dopasowanych, ${result.errors.length} błędów`,
      });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/allegro/reconcile — full stock reconciliation (Allegro → Shop)
   * Manual only — pulls current Allegro stock into shop DB
   */
  app.post("/reconcile", async (_request, reply) => {
    try {
      const result = await fullReconciliation();
      return reply.send({
        success: true,
        data: result,
        message: `Zsynchronizowano ${result.synced} produktów`,
      });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/allegro/poll-events — manually trigger event polling
   */
  app.post("/poll-events", async (_request, reply) => {
    try {
      const result = await pollAllegroEvents();
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/allegro/poll-events-debug — debug: fetch ALL event types (no filter)
   */
  app.post("/poll-events-debug", async (_request, reply) => {
    try {
      // Fetch without type filter to see ALL events
      const allEvents = await allegroFetch("/sale/offer-events?limit=10");

      // Also try with type filter
      const typedEvents = await allegroFetch(
        "/sale/offer-events?limit=10&type=OFFER_STOCK_CHANGED&type=OFFER_PRICE_CHANGED",
      );

      return reply.send({
        success: true,
        data: {
          allEvents: {
            count: allEvents?.events?.length ?? 0,
            sample: (allEvents?.events || []).slice(0, 3),
            rawKeys: Object.keys(allEvents || {}),
          },
          typedEvents: {
            count: typedEvents?.events?.length ?? 0,
            sample: (typedEvents?.events || []).slice(0, 3),
          },
        },
      });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/allegro/sync-product/:id — manually sync single product to Allegro
   */
  app.post<{ Params: { id: string } }>(
    "/sync-product/:id",
    async (request, reply) => {
      try {
        const { id } = request.params;
        const product = await prisma.product.findUnique({
          where: { id },
          select: { stock: true, price: true, marketplaces: true },
        });

        if (!product) {
          return reply
            .status(404)
            .send({ success: false, error: "Produkt nie znaleziony" });
        }

        const mp = product.marketplaces as any;
        if (!mp?.allegro?.productId) {
          return reply.status(400).send({
            success: false,
            error: "Produkt nie jest powiązany z Allegro",
          });
        }

        await syncStockToAllegro(id, product.stock);
        await syncPriceToAllegro(id, Number(product.price));

        return reply.send({
          success: true,
          message: "Zsynchronizowano z Allegro",
        });
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: err.message });
      }
    },
  );

  // ==========================================
  // Info / Debug
  // ==========================================

  /**
   * GET /api/allegro/sync-status — overview of sync state
   */
  app.get("/sync-status", async () => {
    const { isAllegroConnected } = await import("../lib/allegro-client.js");
    const connected = await isAllegroConnected();

    const stats = await prisma.$queryRaw<
      Array<{ total: bigint; with_allegro: bigint; zero_stock: bigint }>
    >`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE marketplaces->'allegro'->>'productId' IS NOT NULL) as with_allegro,
        COUNT(*) FILTER (
          WHERE marketplaces->'allegro'->>'productId' IS NOT NULL
          AND stock = 0
        ) as zero_stock
      FROM products
    `;

    const s = stats[0];
    return {
      success: true,
      data: {
        connected,
        totalProducts: Number(s.total),
        linkedToAllegro: Number(s.with_allegro),
        zeroStockLinked: Number(s.zero_stock),
      },
    };
  });

  /**
   * GET /api/allegro/offers — proxy to list Allegro offers (for admin preview)
   */
  app.get<{ Querystring: { page?: string; limit?: string } }>(
    "/offers",
    async (request, reply) => {
      try {
        const page = parseInt(request.query.page || "0");
        const limit = Math.min(100, parseInt(request.query.limit || "20"));
        const offset = page * limit;

        const data = await allegroFetch(
          `/sale/offers?offset=${offset}&limit=${limit}`,
        );

        return reply.send({
          success: true,
          data: {
            offers: data.offers || [],
            totalCount: data.totalCount || 0,
            page,
            totalPages: Math.ceil((data.totalCount || 0) / limit),
          },
        });
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: err.message });
      }
    },
  );

  /**
   * GET /api/allegro/unlinked-offers — Allegro offers not linked to any shop product
   */
  app.get("/unlinked-offers", async (_request, reply) => {
    try {
      const connected = await isAllegroConnected();
      if (!connected) {
        return reply
          .status(400)
          .send({ success: false, error: "Allegro not connected" });
      }

      // Fetch all offers from Allegro
      let offset = 0;
      const limit = 100;
      let allOffers: any[] = [];

      while (true) {
        const data = await allegroFetch(
          `/sale/offers?offset=${offset}&limit=${limit}`,
        );
        allOffers = allOffers.concat(data.offers || []);
        if (offset + limit >= (data.totalCount || 0)) break;
        offset += limit;
        await new Promise((r) => setTimeout(r, 200));
      }

      // Get all linked Allegro IDs from our DB
      const linkedIds = await prisma.$queryRaw<Array<{ allegro_id: string }>>`
        SELECT marketplaces->'allegro'->>'productId' as allegro_id
        FROM products
        WHERE marketplaces->'allegro'->>'productId' IS NOT NULL
      `;
      const linkedSet = new Set(linkedIds.map((r) => r.allegro_id));

      // Filter to only unlinked
      const unlinked = allOffers
        .filter((offer) => !linkedSet.has(offer.id))
        .map((offer) => ({
          id: offer.id,
          name: offer.name || "",
          price: offer.sellingMode?.price?.amount || "0",
          stock: offer.stock?.available || 0,
          image:
            offer.primaryImage?.url ||
            (offer.images?.[0]?.url ?? offer.images?.[0]) ||
            null,
        }));

      return reply.send({ success: true, data: unlinked });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/allegro/link-product/:productId — link a shop product to an Allegro offer
   */
  app.post<{
    Params: { productId: string };
    Body: { allegroOfferId: string; force?: boolean };
  }>("/link-product/:productId", async (request, reply) => {
    try {
      const { productId } = request.params;
      const { allegroOfferId, force } = request.body;

      if (!allegroOfferId) {
        return reply
          .status(400)
          .send({ success: false, error: "Brak ID oferty Allegro" });
      }

      // Check if this Allegro offer is already linked to another product
      const existingLink = await prisma.product.findFirst({
        where: {
          marketplaces: {
            path: ["allegro", "productId"],
            equals: allegroOfferId,
          },
          NOT: { id: productId },
        },
      });

      if (existingLink && !force) {
        return reply.status(409).send({
          success: false,
          error: `Ta oferta jest już powiązana z produktem "${existingLink.name}"`,
          conflictingProductId: existingLink.id,
        });
      }

      // If force, remove old link
      if (existingLink && force) {
        const oldMp = existingLink.marketplaces as any;
        const { allegro: _removed, ...restOldMp } = oldMp || {};
        await prisma.product.update({
          where: { id: existingLink.id },
          data: { marketplaces: restOldMp },
        });
      }

      // Find our product
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      if (!product) {
        return reply
          .status(404)
          .send({ success: false, error: "Produkt nie znaleziony" });
      }

      // Fetch Allegro offer details
      let allegroOffer: any = {};
      try {
        allegroOffer = await allegroFetch(
          `/sale/product-offers/${allegroOfferId}`,
        );
      } catch (err: any) {
        return reply.status(400).send({
          success: false,
          error: `Nie udało się pobrać oferty Allegro: ${err.message}`,
        });
      }

      const offerPrice = parseFloat(
        allegroOffer.sellingMode?.price?.amount || "0",
      );
      const isActive = allegroOffer.publication?.status === "ACTIVE";

      // Update product with Allegro link
      const mp = product.marketplaces as any;
      await prisma.product.update({
        where: { id: productId },
        data: {
          marketplaces: {
            ...mp,
            allegro: {
              active: isActive,
              productId: allegroOfferId,
              price: offerPrice,
              url: `https://allegro.pl/oferta/${allegroOfferId}`,
              lastSyncAt: new Date().toISOString(),
            },
          },
        },
      });

      return reply.send({
        success: true,
        message: "Produkt powiązany z ofertą Allegro",
        data: {
          productId,
          allegroOfferId,
          allegroUrl: `https://allegro.pl/oferta/${allegroOfferId}`,
        },
      });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  /**
   * DELETE /api/allegro/unlink-product/:productId — remove Allegro link from product
   */
  app.delete<{ Params: { productId: string } }>(
    "/unlink-product/:productId",
    async (request, reply) => {
      try {
        const { productId } = request.params;

        const product = await prisma.product.findUnique({
          where: { id: productId },
        });
        if (!product) {
          return reply
            .status(404)
            .send({ success: false, error: "Produkt nie znaleziony" });
        }

        const mp = product.marketplaces as any;
        const previousAllegroId = mp?.allegro?.productId;
        const previousUrl = mp?.allegro?.url;

        // Remove allegro data from marketplaces
        const { allegro: _removed, ...restMp } = mp || {};
        await prisma.product.update({
          where: { id: productId },
          data: { marketplaces: restMp },
        });

        return reply.send({
          success: true,
          message: "Powiązanie z Allegro usunięte",
          data: {
            productId,
            productName: product.name,
            previousAllegroId,
            previousUrl,
          },
        });
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: err.message });
      }
    },
  );

  /**
   * GET /api/allegro/all-offers — all Allegro offers with link status
   * Returns enriched list: each offer has linkedProductId/Name if linked
   */
  app.get("/all-offers", async (_request, reply) => {
    try {
      const connected = await isAllegroConnected();
      if (!connected) {
        return reply
          .status(400)
          .send({ success: false, error: "Allegro not connected" });
      }

      // 1. Fetch ALL offers from Allegro (paginated)
      let offset = 0;
      const limit = 100;
      let allOffers: any[] = [];

      while (true) {
        const data = await allegroFetch(
          `/sale/offers?offset=${offset}&limit=${limit}`,
        );
        allOffers = allOffers.concat(data.offers || []);
        if (offset + limit >= (data.totalCount || 0)) break;
        offset += limit;
        await new Promise((r) => setTimeout(r, 200));
      }

      // 2. Get all linked products from DB (allegro productId → shop product)
      const linkedProducts = await prisma.$queryRaw<
        Array<{ id: string; name: string; stock: number; allegro_id: string }>
      >`
  SELECT id, name, stock,
    marketplaces->'allegro'->>'productId' as allegro_id
  FROM products
  WHERE marketplaces->'allegro'->>'productId' IS NOT NULL
`;

      const linkMap = new Map<
        string,
        { id: string; name: string; stock: number }
      >();
      for (const p of linkedProducts) {
        linkMap.set(p.allegro_id, {
          id: p.id,
          name: p.name,
          stock: Number(p.stock),
        });
      }

      // 3. Build enriched list
      const enriched = allOffers.map((offer) => {
        const linked = linkMap.get(offer.id);
        return {
          id: offer.id,
          name: offer.name || "",
          price: parseFloat(offer.sellingMode?.price?.amount || "0"),
          stock: offer.stock?.available || 0,
          image:
            offer.primaryImage?.url ||
            offer.images?.[0]?.url ||
            offer.images?.[0] ||
            null,
          active: offer.publication?.status === "ACTIVE",
          linkedProductId: linked?.id || null,
          linkedProductName: linked?.name || null,
          shopStock: linked?.stock ?? null,
        };
      });

      return reply.send({ success: true, data: enriched });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
