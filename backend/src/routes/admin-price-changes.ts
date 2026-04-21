// backend/src/routes/admin-price-changes.ts
// Masowa zmiana cen po kategoriach z podglądem, historią i rollbackiem
// Snapshoty trzymane w tabeli Setting (klucz: price_batch_<id>)

import { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { fireSatelliteRebuild } from "../services/rebuild-satellite.js";
import { fireAllegroStockSync } from "../services/allegro-hooks.js";

// ============================================
// TYPES
// ============================================
interface PriceSnapshot {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  oldPrice: number; // ownStore price before change
  newPrice: number; // ownStore price after change
  oldAllegroPrice: number | null;
  newAllegroPrice: number | null;
}

interface PriceBatch {
  id: string;
  categoryIds: string[];
  categoryNames: string[];
  percentage: number; // e.g. +10 or -5
  affectedCount: number;
  snapshot: PriceSnapshot[];
  appliedAt: string; // ISO date
  rolledBackAt: string | null;
}

// ============================================
// HELPERS
// ============================================
function roundPrice(val: number): number {
  return Math.round(val); // pełne złotówki, bez groszy
}

/** Pobierz produkty dla danych kategorii z cenami */
async function getProductsForCategories(categoryIds: string[]) {
  const products = await prisma.product.findMany({
    where: {
      categories: {
        some: { categoryId: { in: categoryIds } },
      },
    },
    include: {
      categories: {
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });
  return products;
}

// ============================================
// ROUTES
// ============================================
export async function adminPriceChangeRoutes(app: FastifyInstance) {
  // ------------------------------------------
  // POST /preview — podgląd zmian bez zapisywania
  // ------------------------------------------
  app.post<{
    Body: {
      categoryIds: string[];
      percentage: number; // np. 10 = +10%, -5 = -5%
      changeAllegro?: boolean; // czy zmieniać też cenę Allegro
    };
  }>("/preview", async (request, reply) => {
    const { categoryIds, percentage, changeAllegro = false } = request.body;

    if (!categoryIds?.length) {
      return reply.status(400).send({
        success: false,
        error: "Wybierz co najmniej jedną kategorię",
      });
    }
    if (percentage === 0 || percentage === undefined) {
      return reply.status(400).send({
        success: false,
        error: "Podaj niezerowy procent zmiany",
      });
    }

    const products = await getProductsForCategories(categoryIds);
    const multiplier = 1 + percentage / 100;

    const preview: PriceSnapshot[] = products.map((p) => {
      const mp = (p.marketplaces as any) || {};
      const oldPrice = Number(mp.ownStore?.price ?? p.price ?? 0);
      const newPrice = roundPrice(oldPrice * multiplier);

      const oldAllegroPrice = mp.allegro?.price
        ? Number(mp.allegro.price)
        : null;
      const newAllegroPrice =
        changeAllegro && oldAllegroPrice !== null
          ? roundPrice(oldAllegroPrice * multiplier)
          : oldAllegroPrice;

      const cat = p.categories?.[0]?.category;

      return {
        productId: p.id,
        productName: p.name,
        categoryId: cat?.id || "",
        categoryName: cat?.name || "—",
        oldPrice,
        newPrice,
        oldAllegroPrice,
        newAllegroPrice,
      };
    });

    // Statystyki
    const totalOld = preview.reduce((s, p) => s + p.oldPrice, 0);
    const totalNew = preview.reduce((s, p) => s + p.newPrice, 0);

    return {
      success: true,
      data: {
        products: preview,
        stats: {
          count: preview.length,
          percentage,
          totalOldPrice: roundPrice(totalOld),
          totalNewPrice: roundPrice(totalNew),
          totalDiff: roundPrice(totalNew - totalOld),
        },
      },
    };
  });

  // ------------------------------------------
  // POST /apply — zastosuj zmiany + zapisz snapshot
  // ------------------------------------------
  app.post<{
    Body: {
      categoryIds: string[];
      percentage: number;
      changeAllegro?: boolean;
    };
  }>("/apply", async (request, reply) => {
    const { categoryIds, percentage, changeAllegro = false } = request.body;

    if (!categoryIds?.length || !percentage) {
      return reply.status(400).send({
        success: false,
        error: "Brak danych",
      });
    }

    const products = await getProductsForCategories(categoryIds);
    const multiplier = 1 + percentage / 100;

    // Pobierz nazwy kategorii na potrzeby historii
    const cats = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    });
    const catNameMap = Object.fromEntries(cats.map((c) => [c.id, c.name]));

    const snapshot: PriceSnapshot[] = [];

    // === TRANSAKCJA: zmiana cen ===
    for (const p of products) {
      const mp = (p.marketplaces as any) || {};
      const oldPrice = Number(mp.ownStore?.price ?? p.price ?? 0);
      const newPrice = roundPrice(oldPrice * multiplier);

      const oldAllegroPrice = mp.allegro?.price
        ? Number(mp.allegro.price)
        : null;
      const newAllegroPrice =
        changeAllegro && oldAllegroPrice !== null
          ? roundPrice(oldAllegroPrice * multiplier)
          : oldAllegroPrice;

      const cat = p.categories?.[0]?.category;

      snapshot.push({
        productId: p.id,
        productName: p.name,
        categoryId: cat?.id || "",
        categoryName: cat?.name || "—",
        oldPrice,
        newPrice,
        oldAllegroPrice,
        newAllegroPrice,
      });

      // Buduj nowy marketplaces JSON
      const updatedMp = {
        ...mp,
        ownStore: {
          ...mp.ownStore,
          price: newPrice,
        },
      };

      if (changeAllegro && mp.allegro && newAllegroPrice !== null) {
        updatedMp.allegro = {
          ...mp.allegro,
          price: newAllegroPrice,
        };
      }

      await prisma.product.update({
        where: { id: p.id },
        data: {
          price: new Prisma.Decimal(newPrice),
          marketplaces: updatedMp,
        },
      });
    }

    // === Zapisz snapshot do rollbacku ===
    const batchId = randomUUID().slice(0, 8);
    const batch: PriceBatch = {
      id: batchId,
      categoryIds,
      categoryNames: categoryIds.map((id) => catNameMap[id] || id),
      percentage,
      affectedCount: snapshot.length,
      snapshot,
      appliedAt: new Date().toISOString(),
      rolledBackAt: null,
    };

    await prisma.setting.upsert({
      where: { key: `price_batch_${batchId}` },
      update: { value: JSON.stringify(batch) },
      create: { key: `price_batch_${batchId}`, value: JSON.stringify(batch) },
    });

    // Dodaj ID do indeksu batchy
    const indexRaw = await prisma.setting.findUnique({
      where: { key: "price_batch_index" },
    });
    const index: string[] = indexRaw ? JSON.parse(indexRaw.value) : [];
    index.unshift(batchId);
    // Trzymaj max 50 ostatnich
    const trimmed = index.slice(0, 50);
    await prisma.setting.upsert({
      where: { key: "price_batch_index" },
      update: { value: JSON.stringify(trimmed) },
      create: { key: "price_batch_index", value: JSON.stringify(trimmed) },
    });

    // Trigger satellite rebuild
    fireSatelliteRebuild("bulk_price_change");

    return {
      success: true,
      data: {
        batchId,
        affectedCount: snapshot.length,
        percentage,
      },
    };
  });

  // ------------------------------------------
  // POST /rollback/:batchId — cofnij zmianę cen
  // ------------------------------------------
  app.post<{ Params: { batchId: string } }>(
    "/rollback/:batchId",
    async (request, reply) => {
      const { batchId } = request.params;

      const setting = await prisma.setting.findUnique({
        where: { key: `price_batch_${batchId}` },
      });
      if (!setting) {
        return reply.status(404).send({
          success: false,
          error: "Nie znaleziono batcha zmian",
        });
      }

      const batch: PriceBatch = JSON.parse(setting.value);

      if (batch.rolledBackAt) {
        return reply.status(400).send({
          success: false,
          error: "Ten batch został już cofnięty",
        });
      }

      // Przywróć oryginalne ceny
      for (const snap of batch.snapshot) {
        const product = await prisma.product.findUnique({
          where: { id: snap.productId },
        });
        if (!product) continue;

        const mp = (product.marketplaces as any) || {};
        const restoredMp = {
          ...mp,
          ownStore: {
            ...mp.ownStore,
            price: snap.oldPrice,
          },
        };

        if (snap.oldAllegroPrice !== null && mp.allegro) {
          restoredMp.allegro = {
            ...mp.allegro,
            price: snap.oldAllegroPrice,
          };
        }

        await prisma.product.update({
          where: { id: snap.productId },
          data: {
            price: new Prisma.Decimal(snap.oldPrice),
            marketplaces: restoredMp,
          },
        });
      }

      // Oznacz batch jako cofnięty
      batch.rolledBackAt = new Date().toISOString();
      await prisma.setting.update({
        where: { key: `price_batch_${batchId}` },
        data: { value: JSON.stringify(batch) },
      });

      fireSatelliteRebuild("bulk_price_rollback");

      return {
        success: true,
        data: {
          batchId,
          restoredCount: batch.snapshot.length,
        },
      };
    },
  );

  // ------------------------------------------
  // GET /history — lista ostatnich zmian cen
  // ------------------------------------------
  app.get("/history", async (request, reply) => {
    const indexRaw = await prisma.setting.findUnique({
      where: { key: "price_batch_index" },
    });
    if (!indexRaw) return { success: true, data: [] };

    const index: string[] = JSON.parse(indexRaw.value);

    const batches: PriceBatch[] = [];
    for (const batchId of index.slice(0, 20)) {
      const raw = await prisma.setting.findUnique({
        where: { key: `price_batch_${batchId}` },
      });
      if (raw) {
        const batch: PriceBatch = JSON.parse(raw.value);
        // Nie wysyłaj pełnego snapshota w liście — za dużo danych
        batches.push({
          ...batch,
          snapshot: [], // pominięte w liście
        });
      }
    }

    return { success: true, data: batches };
  });

  // ------------------------------------------
  // GET /history/:batchId — szczegóły jednego batcha
  // ------------------------------------------
  app.get<{ Params: { batchId: string } }>(
    "/history/:batchId",
    async (request, reply) => {
      const { batchId } = request.params;
      const raw = await prisma.setting.findUnique({
        where: { key: `price_batch_${batchId}` },
      });
      if (!raw) {
        return reply.status(404).send({
          success: false,
          error: "Nie znaleziono batcha",
        });
      }
      return { success: true, data: JSON.parse(raw.value) };
    },
  );
}
