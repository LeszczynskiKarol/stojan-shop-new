// backend/src/routes/shop-products.ts
// Public shop API - product detail, listing, stock check
// Register: app.register(shopProductRoutes, { prefix: '/api/shop' })

import { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";

// ============================================
// HELPERS
// ============================================
function mapProduct(p: any) {
  return {
    id: p.id,
    name: p.name,
    manufacturer: p.manufacturer,
    price: Number(p.price),
    power: p.power,
    rpm: p.rpm,
    condition: p.condition,
    shaftDiameter: Number(p.shaftDiameter),
    sleeveDiameter: p.sleeveDiameter ? Number(p.sleeveDiameter) : null,
    flangeSize: p.flangeSize ? Number(p.flangeSize) : null,
    flangeBoltCircle: p.flangeBoltCircle ? Number(p.flangeBoltCircle) : null,
    mechanicalSize: p.mechanicalSize,
    weight: p.weight ? Number(p.weight) : null,
    legSpacing: p.legSpacing,
    hasEx: p.hasEx,
    hasBreak: p.hasBreak,
    hasForeignCooling: p.hasForeignCooling,
    startType: p.startType,
    mainImage: p.mainImage,
    galleryImages: p.galleryImages || [],
    images: p.images || [],
    stock: p.stock,
    description: p.description,
    technicalDetails: p.technicalDetails,
    dataSheets: p.dataSheets || [],
    marketplaces: p.marketplaces,
    customParameters: p.customParameters || [],
    categories:
      p.categories?.map((pc: any) => ({
        id: pc.category?.id || pc.id,
        name: pc.category?.name || pc.name,
        slug: pc.category?.slug || pc.slug,
      })) || [],
  };
}

// ============================================
// SIMILARITY SCORING
// ============================================
function parsePowerNum(p: any): number {
  const val = typeof p?.power === "object" ? p.power?.value : p.power;
  if (!val) return 0;
  return parseFloat(String(val).replace(",", ".")) || 0;
}

function parseRpmNum(p: any): number {
  const val = typeof p?.rpm === "object" ? p.rpm?.value : p.rpm;
  if (!val) return 0;
  return parseFloat(String(val).replace(",", ".")) || 0;
}

function scoreSimilarity(
  candidate: any,
  refPower: number,
  refRpm: number,
  refMfr: string,
  refCategoryIds: Set<string>,
): number {
  let score = 0;
  const cPower = parsePowerNum(candidate);
  const cRpm = parseRpmNum(candidate);

  // Power similarity (0-10 points)
  if (refPower > 0 && cPower > 0) {
    const ratio = Math.min(cPower, refPower) / Math.max(cPower, refPower);
    if (ratio === 1)
      score += 10; // exact match
    else if (ratio >= 0.8)
      score += 7; // close (e.g. 4kW vs 5.5kW)
    else if (ratio >= 0.5)
      score += 4; // same ballpark
    else score += 1;
  }

  // RPM similarity (0-8 points)
  if (refRpm > 0 && cRpm > 0) {
    const rpmDiff = Math.abs(cRpm - refRpm);
    if (rpmDiff === 0) score += 8;
    else if (rpmDiff <= 100)
      score += 6; // e.g. 1400 vs 1430
    else if (rpmDiff <= 500)
      score += 3; // e.g. 1400 vs 900
    else score += 1;
  }

  // Same manufacturer (+2)
  if (refMfr && candidate.manufacturer === refMfr) {
    score += 2;
  }

  // Shared category (+3 per match, max 6)
  const cCatIds = new Set(
    (candidate.categories || []).map(
      (pc: any) => pc.categoryId || pc.category?.id,
    ),
  );
  let catMatch = 0;
  for (const id of refCategoryIds) {
    if (cCatIds.has(id)) catMatch++;
  }
  score += Math.min(catMatch * 3, 6);

  // Same condition (+1)
  // Don't weight condition too heavily — similar specs matter more

  return score;
}

// ============================================
// ROUTES
// ============================================
export async function shopProductRoutes(app: FastifyInstance) {
  // ------------------------------------------
  // GET /product/:slug — single product by ownStore slug
  // ------------------------------------------
  app.get<{ Params: { slug: string } }>(
    "/product/:slug",
    async (request, reply) => {
      const { slug } = request.params;

      // Search in marketplaces JSON for ownStore.slug
      const product = await prisma.product.findFirst({
        where: {
          marketplaces: {
            path: ["ownStore", "slug"],
            equals: slug,
          },
        },
        include: {
          categories: {
            include: {
              category: { select: { id: true, name: true, slug: true } },
            },
          },
          manufacturerRel: {
            select: { id: true, name: true, slug: true, description: true },
          },
        },
      });

      if (!product) {
        return reply
          .status(404)
          .send({ success: false, error: "Produkt nie znaleziony" });
      }

      // Increment view count (fire & forget)
      prisma.product
        .update({
          where: { id: product.id },
          data: { viewCount: { increment: 1 } },
        })
        .catch(() => {});

      // ============================================
      // RELATED PRODUCTS — similarity-scored
      // ============================================
      const categoryIds = product.categories.map((pc: any) => pc.categoryId);
      const refPower = parsePowerNum(product);
      const refRpm = parseRpmNum(product);
      const refMfr = product.manufacturer;
      const refCategoryIdSet = new Set(categoryIds);

      let related: any[] = [];

      if (categoryIds.length > 0) {
        // Fetch a larger pool of candidates from same categories
        const candidates = await prisma.product.findMany({
          where: {
            id: { not: product.id },
            categories: { some: { categoryId: { in: categoryIds } } },
            stock: { gt: 0 },
          },
          include: {
            categories: {
              include: {
                category: { select: { id: true, name: true, slug: true } },
              },
            },
          },
          take: 100,
          orderBy: { purchaseCount: "desc" },
        });

        // Score and sort by similarity (descending)
        const scored = candidates.map((c) => ({
          product: c,
          score: scoreSimilarity(c, refPower, refRpm, refMfr, refCategoryIdSet),
        }));

        scored.sort((a, b) => b.score - a.score);

        // Return top 32 for progressive reveal on frontend
        related = scored.slice(0, 32).map((s) => s.product);
      }

      return {
        success: true,
        data: {
          product: mapProduct(product),
          manufacturer: product.manufacturerRel,
          related: related.map(mapProduct),
        },
      };
    },
  );

  // ------------------------------------------
  // POST /check-stock — verify stock before adding to cart
  // ------------------------------------------
  app.post<{ Body: { productId: string; requestedQuantity: number } }>(
    "/check-stock",
    async (request, reply) => {
      const { productId, requestedQuantity = 1 } = request.body;

      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { stock: true },
      });

      if (!product) {
        return reply
          .status(404)
          .send({ success: false, error: "Produkt nie znaleziony" });
      }

      return {
        success: true,
        data: {
          isAvailable: product.stock >= requestedQuantity,
          currentStock: product.stock,
        },
      };
    },
  );
}
