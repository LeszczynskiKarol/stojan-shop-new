// backend/src/routes/products.ts
import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { googleMerchantFeedRoute } from "./google-merchant-feed.js";

// ============================================
// SMART SEARCH PARSER
// ============================================
interface ParsedSearch {
  power: string | null; // e.g. "3" from "3kw" or "3 kw"
  rpm: string | null; // e.g. "1400" from "1400obr"
  condition: string | null; // "nowy", "uzywany", "nieuzywany"
  tokens: string[]; // remaining text tokens for full-text search
}

function parseSearchQuery(raw: string): ParsedSearch {
  let q = raw.trim().toLowerCase();
  let power: string | null = null;
  let rpm: string | null = null;
  let condition: string | null = null;

  // --- Extract power: "3kw", "3 kw", "3,5kw", "3.5 kw", "0,75kw" etc. ---
  // Pattern: number (with optional comma/dot decimals) followed by optional space + "kw"
  const pwRegex = /(\d+[.,]\d+|\d+)\s*kw\b/gi;
  const pwMatch = pwRegex.exec(q);
  if (pwMatch) {
    power = pwMatch[1].replace(",", ".");
    // Remove the matched part from query
    q = q.replace(pwMatch[0], " ");
  }

  // --- Extract RPM: "1400obr", "1400 obr", "1400 obr/min", "2900rpm" ---
  const rpmRegex = /(\d{3,4})\s*(?:obr(?:\/min)?|rpm)\b/gi;
  const rpmMatch = rpmRegex.exec(q);
  if (rpmMatch) {
    rpm = rpmMatch[1];
    q = q.replace(rpmMatch[0], " ");
  }

  // --- Extract condition ---
  const condMap: Record<string, string> = {
    nowy: "nowy",
    nowe: "nowy",
    nowych: "nowy",
    nowego: "nowy",
    używany: "uzywany",
    uzywany: "uzywany",
    używane: "uzywany",
    uzywane: "uzywany",
    używanych: "uzywany",
    nieużywany: "nieuzywany",
    nieuzywany: "nieuzywany",
    nieużywane: "nieuzywany",
    nieuzywane: "nieuzywany",
    magazynowy: "nieuzywany",
    magazynowe: "nieuzywany",
  };
  for (const [word, cond] of Object.entries(condMap)) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    if (regex.test(q)) {
      condition = cond;
      q = q.replace(regex, " ");
      break;
    }
  }

  // --- Remove noise words ---
  const noise = [
    "silnik",
    "silniki",
    "silnika",
    "silników",
    "silniku",
    "elektryczny",
    "elektryczne",
    "elektrycznego",
    "elektrycznych",
    "motor",
    "motory",
    "motoreduktor",
    "motoreduktory",
    "pompa",
    "pompy",
    "wentylator",
    "wentylatory",
    "trójfazowy",
    "trojfazowy",
    "trójfazowe",
    "trojfazowe",
    "jednofazowy",
    "jednofazowe",
    "indukcyjny",
    "indukcyjne",
    "z",
    "do",
    "na",
    "w",
    "i",
    "o",
    "od",
    "ze",
  ];
  const noiseSet = new Set(noise);

  // Tokenize remaining
  const tokens = q
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !noiseSet.has(t));

  return { power, rpm, condition, tokens };
}

// Build Prisma WHERE for a single text token — matches in name, manufacturer, or description
function tokenToWhere(token: string): Prisma.ProductWhereInput {
  return {
    OR: [
      { name: { contains: token, mode: "insensitive" } },
      { manufacturer: { contains: token, mode: "insensitive" } },
      { description: { contains: token, mode: "insensitive" } },
      { technicalDetails: { contains: token, mode: "insensitive" } },
      { customParameters: { string_contains: token } },
      { customParameters: { string_contains: token.toLowerCase() } },
    ],
  };
}

// ============================================
// ROUTES
// ============================================
export async function productRoutes(app: FastifyInstance) {
  app.register(googleMerchantFeedRoute);

  // GET /api/products - Lista produktów z filtrami
  app.get("/", async (request, reply) => {
    const {
      page = "1",
      limit = "20",
      category,
      manufacturer,
      power,
      rpm,
      condition,
      minPrice,
      maxPrice,
      inStock,
      sort = "createdAt",
      order = "desc",
      search,
    } = request.query as Record<string, string>;

    const where: Prisma.ProductWhereInput = {};
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(2000, parseInt(limit)); // raised for client-side filtering

    // Filtr: kategoria
    if (category) {
      where.categories = { some: { category: { slug: category } } };
    }

    // Filtr: producent
    if (manufacturer) {
      const mfrRecord = await prisma.manufacturer.findFirst({
        where: {
          OR: [
            { slug: manufacturer },
            { slug: `marka-producent/${manufacturer}` },
            { slug: { startsWith: `${manufacturer}-` } },
            { slug: { startsWith: `marka-producent/${manufacturer}-` } },
            // Match by exact name (when frontend passes manufacturer name)
            { name: { equals: manufacturer, mode: "insensitive" } },
          ],
        },
      });

      if (mfrRecord) {
        // Match products by relation ID or by manufacturer name string
        const mfrFilter: Prisma.ProductWhereInput = {
          OR: [
            { manufacturerId: mfrRecord.id },
            { manufacturer: mfrRecord.name },
          ],
        };
        where.AND = [...(Array.isArray(where.AND) ? where.AND : []), mfrFilter];
      } else {
        // Fallback: match by string field directly
        where.manufacturer = { contains: manufacturer, mode: "insensitive" };
      }
    }
    // Filtr: moc (JSON field)
    if (power) {
      where.power = { path: ["value"], equals: power };
    }

    // Filtr: obroty (JSON field)
    if (rpm) {
      where.rpm = { path: ["value"], equals: rpm };
    }

    // Filtr: stan
    if (condition) {
      where.condition = condition as any;
    }

    // Filtr: cena
    if (minPrice || maxPrice) {
      where.price = {
        ...(minPrice ? { gte: parseFloat(minPrice) } : {}),
        ...(maxPrice ? { lte: parseFloat(maxPrice) } : {}),
      };
    }

    // Filtr: w magazynie
    if (inStock === "true") {
      where.stock = { gt: 0 };
    }

    // ============================================
    // SMART SEARCH
    // ============================================
    if (search) {
      const parsed = parseSearchQuery(search);
      const conditions: Prisma.ProductWhereInput[] = [];

      // Power filter from search query (e.g. "3kw" → power.value = "3")
      if (parsed.power) {
        // Try exact match first, also try with comma format (DB might store "3" or "3,0")
        const pDot = parsed.power;
        const pComma = parsed.power.replace(".", ",");
        // Also handle: user types "3" but DB has "3,0" or "3.0"
        const pVariants = [pDot, pComma];
        // Add .0 variant if it's a whole number
        if (!pDot.includes(".")) {
          pVariants.push(`${pDot}.0`, `${pDot},0`);
        }
        conditions.push({
          OR: pVariants.map((v) => ({
            power: { path: ["value"], equals: v },
          })),
        });
      }

      // RPM filter from search query
      if (parsed.rpm) {
        conditions.push({
          OR: [
            { rpm: { path: ["value"], equals: parsed.rpm } },
            { rpm: { path: ["range"], equals: parsed.rpm } },
          ],
        });
      }

      // Condition filter from search query
      if (parsed.condition) {
        conditions.push({ condition: parsed.condition as any });
      }

      // Text tokens — each must match somewhere (AND logic)
      for (const token of parsed.tokens) {
        conditions.push(tokenToWhere(token));
      }

      // If we only extracted structured filters (power/rpm/condition) but no text tokens,
      // and there's nothing to search for textually, that's fine — the structured filters apply.
      // If we have neither structured filters nor tokens, fall back to full-text on original query.
      if (conditions.length === 0) {
        // Fallback: search the raw query as-is (shouldn't normally happen)
        conditions.push(tokenToWhere(search));
      }

      // Combine: all conditions must match (AND)
      if (where.AND) {
        (where.AND as Prisma.ProductWhereInput[]).push(...conditions);
      } else {
        where.AND = conditions;
      }
    }

    // Sortowanie
    const orderBy: Prisma.ProductOrderByWithRelationInput = {};
    const validSorts = [
      "price",
      "createdAt",
      "name",
      "viewCount",
      "purchaseCount",
    ];
    const sortField = validSorts.includes(sort) ? sort : "createdAt";
    (orderBy as any)[sortField] = order === "asc" ? "asc" : "desc";

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        include: {
          categories: {
            include: {
              category: { select: { id: true, name: true, slug: true } },
            },
          },
          manufacturerRel: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return {
      success: true,
      data: {
        products,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    };
  });

  // GET /api/products/popular
  app.get("/popular", async (request, reply) => {
    const { limit = "8" } = request.query as Record<string, string>;
    const products = await prisma.product.findMany({
      where: { stock: { gt: 0 } },
      orderBy: [{ purchaseCount: "desc" }, { viewCount: "desc" }],
      take: parseInt(limit),
      include: {
        categories: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
    return { success: true, data: products };
  });

  // GET /api/products/latest
  app.get("/latest", async (request, reply) => {
    const { limit = "8" } = request.query as Record<string, string>;
    const products = await prisma.product.findMany({
      where: { stock: { gt: 0 } },
      orderBy: { createdAt: "desc" },
      take: parseInt(limit),
      include: {
        categories: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
    return { success: true, data: products };
  });

  // GET /api/products/by-power/:power
  // Handles: /api/products/by-power/7.5?rpm=900
  app.get("/by-power/:power", async (request, reply) => {
    const { power } = request.params as { power: string };
    const {
      rpm,
      page = "1",
      limit = "100",
    } = request.query as Record<string, string>;

    // Power is stored with comma ("7,5") but URL uses dot ("7.5")
    // Match both formats for safety
    const pDot = power.replace(",", ".");
    const pComma = power.replace(".", ",");
    const powerVariants = [pDot, pComma];
    // Also handle whole numbers: "3" → also try "3,0" and "3.0"
    if (!pDot.includes(".")) {
      powerVariants.push(`${pDot}.0`, `${pDot},0`);
    }

    const where: Prisma.ProductWhereInput = {
      OR: powerVariants.map((v) => ({
        power: { path: ["value"], equals: v },
      })),
      stock: { gt: 0 },
    };

    // RPM: check rpm.value (NOT rpm.range — range is always empty)
    if (rpm) {
      // For nominal RPM like "900", actual values can vary (e.g. "880", "920")
      // Use a tolerance range approach: find products where rpm.value
      // is close to the requested rpm
      const rpmNum = parseInt(rpm);
      // Define tolerance based on nominal speed
      const tolerance: Record<number, [number, number]> = {
        700: [400, 800],
        900: [800, 1200],
        1400: [1200, 2100],
        2900: [2500, 3500],
      };
      const range = tolerance[rpmNum];

      if (range) {
        // Fetch all matching power products, then filter RPM in JS
        // because Prisma JSON filtering doesn't support numeric range on string values
        // We'll do post-filtering below
      } else {
        // Exact match fallback for non-standard RPM values
        where.AND = [
          {
            OR: [
              { rpm: { path: ["value"], equals: rpm } },
              { rpm: { path: ["value"], equals: String(rpmNum) } },
            ],
          },
        ];
      }
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(500, parseInt(limit));

    // If we need RPM range filtering, fetch more and filter in JS
    const rpmNum = rpm ? parseInt(rpm) : null;
    const rpmRange: Record<number, [number, number]> = {
      700: [400, 800],
      900: [800, 1200],
      1400: [1200, 2100],
      2900: [2500, 3500],
    };
    const needsJsFilter = rpmNum !== null && rpmRange[rpmNum] !== undefined;

    if (needsJsFilter) {
      // Fetch all power-matched products (no RPM filter in DB)
      const allProducts = await prisma.product.findMany({
        where,
        orderBy: { price: "asc" },
        include: {
          categories: {
            include: {
              category: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      });

      // Filter by RPM range in JavaScript
      const [rpmMin, rpmMax] = rpmRange[rpmNum!];
      const filtered = allProducts.filter((p) => {
        const rpmVal = parseFloat(
          String((p.rpm as any)?.value || "0").replace(",", "."),
        );
        return rpmVal >= rpmMin && rpmVal <= rpmMax;
      });

      const total = filtered.length;
      const paginated = filtered.slice(
        (pageNum - 1) * limitNum,
        pageNum * limitNum,
      );

      return {
        success: true,
        data: {
          products: paginated,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum),
          },
        },
      };
    }

    // Standard path (no RPM or non-standard RPM)
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { price: "asc" },
        include: {
          categories: {
            include: {
              category: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return {
      success: true,
      data: {
        products,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    };
  });

  // GET /api/products/:categorySlug/:productSlug
  app.get("/:categorySlug/:productSlug", async (request, reply) => {
    const { categorySlug, productSlug } = request.params as {
      categorySlug: string;
      productSlug: string;
    };
    const product = await prisma.product.findFirst({
      where: {
        marketplaces: { path: ["ownStore", "slug"], equals: productSlug },
        categories: { some: { category: { slug: categorySlug } } },
      },
      include: {
        categories: { include: { category: true } },
        manufacturerRel: true,
      },
    });
    if (!product)
      return reply
        .status(404)
        .send({ success: false, error: "Produkt nie znaleziony" });
    prisma.product
      .update({
        where: { id: product.id },
        data: { viewCount: { increment: 1 } },
      })
      .catch(() => {});
    return { success: true, data: product };
  });
  // GET /api/products/by-id/:id — fallback for products without ownStore slug
  app.get("/by-id/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        categories: { include: { category: true } },
        manufacturerRel: true,
      },
    });
    if (!product)
      return reply
        .status(404)
        .send({ success: false, error: "Produkt nie znaleziony" });
    prisma.product
      .update({ where: { id }, data: { viewCount: { increment: 1 } } })
      .catch(() => {});
    return { success: true, data: product };
  });
}
