// backend/src/routes/admin-products.ts
// Admin panel product management - Fastify + Prisma

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  fireAllegroStockSync,
  fireAllegroPriceSync,
  fireAllegroNameSync,
} from "../services/allegro-hooks.js";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import path from "path";
import { uploadToS3 } from "../lib/s3.js";

// ============================================
// HELPERS
// ============================================
function toNumber(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function mapProduct(p: any) {
  return {
    ...p,
    price: Number(p.price),
    shaftDiameter: Number(p.shaftDiameter),
    sleeveDiameter: p.sleeveDiameter ? Number(p.sleeveDiameter) : null,
    flangeSize: p.flangeSize ? Number(p.flangeSize) : null,
    flangeBoltCircle: p.flangeBoltCircle ? Number(p.flangeBoltCircle) : null,
    weight: p.weight ? Number(p.weight) : null,
    categories: p.categories?.map((pc: any) => pc.category || pc) || [],
  };
}

function buildOrderBy(sortField?: string, sortDirection?: string): any {
  const dir = (
    sortDirection?.toLowerCase() === "asc" ? "asc" : "desc"
  ) as Prisma.SortOrder;
  const simpleFields: Record<string, string> = {
    name: "name",
    manufacturer: "manufacturer",
    stock: "stock",
    price: "price",
    condition: "condition",
    createdAt: "createdAt",
    weight: "weight",
    mechanicalSize: "mechanicalSize",
    shaftDiameter: "shaftDiameter",
  };
  const field = simpleFields[sortField || ""];
  if (field) return { [field]: dir };
  return { createdAt: "desc" as Prisma.SortOrder };
}

// FIX #3: Helper to generate URL-safe slug from product name
function generateSlug(name: string): string {
  const polishMap: Record<string, string> = {
    ą: "a",
    ć: "c",
    ę: "e",
    ł: "l",
    ń: "n",
    ó: "o",
    ś: "s",
    ź: "z",
    ż: "z",
  };
  return name
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => polishMap[c] || c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 200);
}

// ============================================
// ROUTES
// ============================================
export async function adminProductRoutes(app: FastifyInstance) {
  // ------------------------------------------
  // GET / — paginated list (admin)
  // ------------------------------------------
  app.get(
    "/",
    async (
      request: FastifyRequest<{
        Querystring: {
          page?: string;
          limit?: string;
          sortField?: string;
          sortDirection?: string;
          search?: string;
        };
      }>,
    ) => {
      const page = Math.max(0, parseInt(request.query.page || "0"));
      const limit = Math.min(
        2000,
        Math.max(1, parseInt(request.query.limit || "20")),
      );
      const { sortField, sortDirection, search } = request.query;

      const where: Prisma.ProductWhereInput = {};

      // Allegro link filter
      const allegroFilter = (request.query as any).allegroFilter as
        | string
        | undefined;
      if (allegroFilter === "linked") {
        where.marketplaces = {
          path: ["allegro", "productId"],
          not: Prisma.DbNull,
        };
      } else if (allegroFilter === "unlinked") {
        where.NOT = {
          marketplaces: {
            path: ["allegro", "productId"],
            not: Prisma.DbNull,
          },
        };
      }

      if (search?.trim()) {
        const term = search.trim();
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : []),
          {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { manufacturer: { contains: term, mode: "insensitive" } },
              { technicalDetails: { contains: term, mode: "insensitive" } },
              { customParameters: { string_contains: term } },
              { customParameters: { string_contains: term.toLowerCase() } },
            ],
          },
        ];
      }

      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include: {
            categories: {
              include: {
                category: { select: { id: true, name: true, slug: true } },
              },
            },
          },
          orderBy: buildOrderBy(sortField, sortDirection),
          skip: page * limit,
          take: limit,
        }),
        prisma.product.count({ where }),
      ]);

      return {
        success: true,
        data: {
          products: products.map(mapProduct),
          total,
          page,
          totalPages: Math.ceil(total / limit),
        },
      };
    },
  );

  // ------------------------------------------
  // GET /categories — all categories for dropdown
  // ------------------------------------------
  app.get("/categories", async () => {
    const categories = await prisma.category.findMany({
      select: { id: true, name: true, slug: true, order: true },
      orderBy: { order: "asc" },
    });
    return { success: true, data: categories };
  });

  // ------------------------------------------
  // GET /manufacturers — all manufacturers for modal
  // ------------------------------------------
  app.get("/manufacturers", async () => {
    const manufacturers = await prisma.manufacturer.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    });
    return { success: true, data: manufacturers };
  });

  // ------------------------------------------
  // POST /manufacturers — create new manufacturer
  // ------------------------------------------
  app.post<{ Body: { name: string } }>(
    "/manufacturers",
    async (request, reply) => {
      const { name } = request.body;
      if (!name?.trim())
        return reply
          .status(400)
          .send({ success: false, error: "Nazwa wymagana" });

      const slug = `marka-producent/${name
        .toLowerCase()
        .replace(
          /[ąćęłńóśźż]/g,
          (c: string) =>
            ({
              ą: "a",
              ć: "c",
              ę: "e",
              ł: "l",
              ń: "n",
              ó: "o",
              ś: "s",
              ź: "z",
              ż: "z",
            })[c] || c,
        )
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")}`;

      const existing = await prisma.manufacturer.findFirst({
        where: { name: { equals: name.trim(), mode: "insensitive" } },
      });
      if (existing) return { success: true, data: existing };

      const manufacturer = await prisma.manufacturer.create({
        data: { name: name.trim(), slug, description: "" },
      });
      return reply.status(201).send({ success: true, data: manufacturer });
    },
  );

  // ------------------------------------------
  // PUT /:id — update product (inline edit)
  // ------------------------------------------
  app.put<{ Params: { id: string }; Body: Record<string, any> }>(
    "/:id",
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;

      const existing = await prisma.product.findUnique({ where: { id } });
      if (!existing)
        return reply
          .status(404)
          .send({ success: false, error: "Produkt nie znaleziony" });

      const data: Prisma.ProductUpdateInput = {};

      // String fields
      for (const f of [
        "name",
        "manufacturer",
        "legSpacing",
        "startType",
        "description",
        "technicalDetails",
      ]) {
        if (body[f] !== undefined) (data as any)[f] = body[f];
      }

      // Decimal fields
      if (body.price !== undefined)
        data.price = new Prisma.Decimal(toNumber(body.price));
      if (body.shaftDiameter !== undefined)
        data.shaftDiameter = new Prisma.Decimal(toNumber(body.shaftDiameter));
      if (body.sleeveDiameter !== undefined)
        data.sleeveDiameter = body.sleeveDiameter
          ? new Prisma.Decimal(toNumber(body.sleeveDiameter))
          : null;
      if (body.flangeSize !== undefined)
        data.flangeSize = body.flangeSize
          ? new Prisma.Decimal(toNumber(body.flangeSize))
          : null;
      if (body.flangeBoltCircle !== undefined)
        data.flangeBoltCircle = body.flangeBoltCircle
          ? new Prisma.Decimal(toNumber(body.flangeBoltCircle))
          : null;
      if (body.weight !== undefined)
        data.weight = body.weight
          ? new Prisma.Decimal(toNumber(body.weight))
          : null;

      // Int
      if (body.stock !== undefined) data.stock = parseInt(body.stock) || 0;
      if (body.mechanicalSize !== undefined)
        data.mechanicalSize = parseInt(body.mechanicalSize) || 0;

      // Bool
      if (body.hasBreak !== undefined) data.hasBreak = Boolean(body.hasBreak);
      if (body.hasForeignCooling !== undefined)
        data.hasForeignCooling = Boolean(body.hasForeignCooling);
      if (body.hasEx !== undefined) data.hasEx = Boolean(body.hasEx);

      // JSON
      if (body.power !== undefined) data.power = body.power;
      if (body.rpm !== undefined) data.rpm = body.rpm;
      if (body.customParameters !== undefined)
        data.customParameters = body.customParameters;
      if (body.marketplaces !== undefined)
        data.marketplaces = body.marketplaces;

      // Enum
      if (body.condition !== undefined) data.condition = body.condition;

      // Arrays
      if (body.mainImage !== undefined) data.mainImage = body.mainImage;
      if (body.galleryImages !== undefined)
        data.galleryImages = body.galleryImages;
      if (body.dataSheets !== undefined) data.dataSheets = body.dataSheets;

      // FIX #3b: If name changes, also update the ownStore slug in marketplaces
      if (body.name !== undefined && !body.marketplaces) {
        const currentMp = (existing.marketplaces as any) || {};
        data.marketplaces = {
          ...currentMp,
          ownStore: {
            ...currentMp.ownStore,
            slug: generateSlug(body.name),
          },
        };
      }

      await prisma.product.update({ where: { id }, data });

      // ▶ ALLEGRO SYNC HOOKS
      if (body.stock !== undefined) {
        fireAllegroStockSync(id, parseInt(body.stock) || 0);
      }
      if (body.price !== undefined) {
        const newPrice =
          body.marketplaces?.ownStore?.price ?? parseFloat(body.price);
        fireAllegroPriceSync(id, newPrice);
      }
      if (body.name !== undefined) {
        fireAllegroNameSync(id, body.name);
      }

      // Categories (M2M)
      if (body.categoryId !== undefined) {
        await prisma.productCategory.deleteMany({ where: { productId: id } });
        if (body.categoryId) {
          await prisma.productCategory.create({
            data: { productId: id, categoryId: body.categoryId },
          });
        }
      }

      const result = await prisma.product.findUnique({
        where: { id },
        include: {
          categories: {
            include: {
              category: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      });

      return { success: true, data: mapProduct(result) };
    },
  );

  // ------------------------------------------
  // DELETE /:id — delete product
  // ------------------------------------------
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing)
      return reply
        .status(404)
        .send({ success: false, error: "Produkt nie znaleziony" });
    await prisma.product.delete({ where: { id } });
    return { success: true, message: "Produkt usunięty" };
  });

  // ------------------------------------------
  // POST / — create product
  // ------------------------------------------
  app.post<{ Body: any }>("/", async (request, reply) => {
    const body = request.body;

    // Resolve category ID (frontend sends slug-based data)
    let categoryId: string | null = null;
    let categorySlug: string = "";
    if (body.categories?.length) {
      const cat = await prisma.category.findFirst({
        where: { slug: body.categories[0].slug },
      });
      categoryId = cat?.id || null;
      categorySlug = cat?.slug || body.categories[0].slug || "";
    } else if (body.categoryId) {
      categoryId = body.categoryId;
      const cat = await prisma.category.findUnique({
        where: { id: body.categoryId },
        select: { slug: true },
      });
      categorySlug = cat?.slug || "";
    }

    // FIX #3: Generate a proper ownStore slug from product name
    const productSlug = generateSlug(body.name || "nowy-produkt");

    // Ensure slug uniqueness by checking existing products
    let finalSlug = productSlug;
    const existingWithSlug = await prisma.product.findFirst({
      where: {
        marketplaces: { path: ["ownStore", "slug"], equals: productSlug },
      },
    });
    if (existingWithSlug) {
      // Append a short unique suffix
      finalSlug = `${productSlug}-${Date.now().toString(36)}`;
    }

    // Build the full marketplaces object with slug and category_path
    const marketplaces = {
      ...(body.marketplaces || {}),
      ownStore: {
        active: true,
        price: body.price || body.marketplaces?.ownStore?.price || 0,
        slug: finalSlug,
        category_path: categorySlug ? `/${categorySlug}` : "",
        ...(body.marketplaces?.ownStore || {}),
        // Ensure slug/category_path are not overridden by empty frontend values
      },
    };
    // Force our generated slug (frontend doesn't send one)
    marketplaces.ownStore.slug = finalSlug;
    marketplaces.ownStore.category_path = categorySlug
      ? `/${categorySlug}`
      : "";

    const product = await prisma.product.create({
      data: {
        name: body.name || "Nowy produkt",
        manufacturer: body.manufacturer || "",
        price: new Prisma.Decimal(
          body.price || body.marketplaces?.ownStore?.price || 0,
        ),
        power: body.power || { value: "0", range: "" },
        rpm: body.rpm || { value: "0", range: "" },
        condition: body.condition || "nowy",
        shaftDiameter: new Prisma.Decimal(body.shaftDiameter || 0),
        sleeveDiameter: body.sleeveDiameter
          ? new Prisma.Decimal(body.sleeveDiameter)
          : null,
        flangeSize: body.flangeSize
          ? new Prisma.Decimal(body.flangeSize)
          : null,
        flangeBoltCircle: body.flangeBoltCircle
          ? new Prisma.Decimal(body.flangeBoltCircle)
          : null,
        mechanicalSize: parseInt(body.mechanicalSize) || 0,
        weight: body.weight ? new Prisma.Decimal(body.weight) : null,
        legSpacing: body.legSpacing || null,
        stock: parseInt(body.stock) || 0,
        description: body.description || null,
        startType: body.startType || null,
        hasBreak: Boolean(body.hasBreak),
        hasEx: Boolean(body.hasEx),
        hasForeignCooling: Boolean(body.hasForeignCooling),
        mainImage: body.mainImage || null,
        images: body.images || [],
        galleryImages: body.galleryImages || [],
        dataSheets: body.dataSheets || [],
        customParameters: body.customParameters || null,
        marketplaces,
      },
    });

    // Link category if found
    if (categoryId) {
      await prisma.productCategory.create({
        data: { productId: product.id, categoryId },
      });
    }

    // Reload with categories
    const result = await prisma.product.findUnique({
      where: { id: product.id },
      include: {
        categories: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    return reply.status(201).send({ success: true, data: mapProduct(result) });
  });

  // ------------------------------------------
  // POST /bulk-delete — bulk delete
  // ------------------------------------------
  app.post<{ Body: { ids: string[] } }>(
    "/bulk-delete",
    async (request, reply) => {
      const { ids } = request.body;
      if (!ids?.length)
        return reply.status(400).send({ success: false, error: "Brak ID" });
      const result = await prisma.product.deleteMany({
        where: { id: { in: ids } },
      });
      return { success: true, deleted: result.count };
    },
  );

  // ------------------------------------------
  // POST /upload/images — upload product images
  // ------------------------------------------
  app.post("/upload/images", async (request, reply) => {
    const parts = request.parts();
    const urls: string[] = [];

    for await (const part of parts) {
      if (part.type === "file") {
        const buffer = await part.toBuffer();
        const sharp = (await import("sharp")).default;
        const optimized = await sharp(buffer)
          .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();

        const key = `products/${randomUUID()}.webp`;
        const url = await uploadToS3(optimized, key, "image/webp");
        urls.push(url);
      }
    }

    if (!urls.length)
      return reply.status(400).send({ success: false, error: "Brak plików" });
    return { success: true, data: { urls } };
  });

  // ------------------------------------------
  // POST /upload/datasheets — upload PDFs
  // ------------------------------------------
  app.post("/upload/datasheets", async (request, reply) => {
    const parts = request.parts();
    const urls: string[] = [];

    for await (const part of parts) {
      if (part.type === "file") {
        const buffer = await part.toBuffer();
        const ext = path.extname(part.filename || ".pdf") || ".pdf";
        const key = `datasheets/${randomUUID()}${ext}`;
        const url = await uploadToS3(
          buffer,
          key,
          part.mimetype || "application/pdf",
        );
        urls.push(url);
      }
    }

    if (!urls.length)
      return reply.status(400).send({ success: false, error: "Brak plików" });
    return { success: true, data: { urls } };
  });

  // ------------------------------------------
  // POST /generate-description — AI description
  // ------------------------------------------
  app.post<{ Body: { productId: string } }>(
    "/generate-description",
    async (request, reply) => {
      const { productId } = request.body;
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      if (!product)
        return reply
          .status(404)
          .send({ success: false, error: "Produkt nie znaleziony" });

      const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
      if (!ANTHROPIC_API_KEY)
        return reply
          .status(500)
          .send({ success: false, error: "Brak klucza API" });

      const power = (product.power as any)?.value || "?";
      const rpm = (product.rpm as any)?.value || "?";

      const prompt = `Napisz profesjonalny, SEO-friendly opis produktu po polsku dla sklepu z silnikami elektrycznymi.

Produkt: ${product.name}
Producent: ${product.manufacturer}
Moc: ${power} kW
Obroty: ${rpm} obr/min
Stan: ${product.condition === "nowy" ? "Nowy" : product.condition === "uzywany" ? "Używany" : "Nieużywany"}
Wielkość mechaniczna: ${product.mechanicalSize}
Średnica wału: ${product.shaftDiameter} mm
${product.weight ? `Waga: ${product.weight} kg` : ""}

Napisz 3-4 akapity. Oddziel je pustą linią. Używaj tagów html, ale wyłącznie <h2></h2> i <p></p> - bez list i innych elementów.
Skup się na: zastosowaniach, zaletach, parametrach technicznych.`;

      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const result = (await res.json()) as any;
        const text = result.content?.[0]?.text || "";
        const html = text
          .split("\n")
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 0)
          .map((l: string) => `<p>${l}</p>`)
          .join("");
        return { success: true, data: { description: html } };
      } catch (error) {
        console.error("AI generation error:", error);
        return reply
          .status(500)
          .send({ success: false, error: "Błąd generowania opisu" });
      }
    },
  );
}
