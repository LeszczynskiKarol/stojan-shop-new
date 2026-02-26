/**
 * import-from-json.ts
 *
 * Importuje dane z JSON (wyeksportowanych z EC2) do lokalnej bazy Prisma.
 *
 * Uruchomienie:
 *   cd d:\stojan-shop-new\backend
 *   npx tsx scripts/import-from-json.ts
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "migration-data");

const prisma = new PrismaClient();

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function loadJson<T = any>(filename: string): T[] {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) {
    log(`⚠️ Brak pliku: ${filename} - pomijam`);
    return [];
  }
  return JSON.parse(fs.readFileSync(filepath, "utf-8"));
}

function mpathToParentId(mpath: string | null): string | null {
  if (!mpath) return null;
  const segments = mpath.replace(/\.$/, "").split(".");
  if (segments.length <= 1) return null;
  return segments[segments.length - 2];
}

async function main() {
  console.log("=".repeat(60));
  console.log("  IMPORT Z JSON → Prisma (stojan_shop)");
  console.log("=".repeat(60));
  console.log(`  Źródło: ${DATA_DIR}\n`);

  if (!fs.existsSync(DATA_DIR)) {
    console.error(`❌ Brak katalogu ${DATA_DIR}`);
    process.exit(1);
  }

  await prisma.$queryRaw`SELECT 1`;
  log("✅ Połączenie z bazą OK\n");

  // ---- CZYSZCZENIE ----
  log("🧹 Czyszczenie tabel...");
  await prisma.productCategory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.manufacturer.deleteMany();
  await prisma.order.deleteMany();
  await prisma.blogPost.deleteMany();
  await prisma.legalPage.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.task.deleteMany();
  log("  ✅ Wyczyszczone\n");

  const stats: Record<string, number> = {};

  // ---- MANUFACTURERS ----
  const manufacturers = loadJson("manufacturers.json");
  for (const m of manufacturers) {
    await prisma.manufacturer.create({
      data: {
        id: m.id,
        name: m.name,
        slug: m.slug,
        description: m.description || null,
        seo: m.seo || null,
        images: Array.isArray(m.images) ? m.images : [],
        createdAt: new Date(m.createdAt),
        updatedAt: new Date(m.updatedAt),
      },
    });
  }
  stats.manufacturers = manufacturers.length;
  log(`✅ manufacturers: ${manufacturers.length}`);

  // ---- CATEGORIES ----
  const categories = loadJson("categories.json");
  for (const c of categories) {
    await prisma.category.create({
      data: {
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description || null,
        order: c.order || 0,
        image: c.image || null,
        metadata: c.metadata || null,
        productFilters: c.productFilters || null,
        mpath: c.mpath || "",
        parentId: null,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
      },
    });
  }
  // Faza 2: parentId z mpath
  let parentUpdates = 0;
  for (const c of categories) {
    const parentId = mpathToParentId(c.mpath);
    if (parentId) {
      try {
        await prisma.category.update({
          where: { id: c.id },
          data: { parentId },
        });
        parentUpdates++;
      } catch {}
    }
  }
  stats.categories = categories.length;
  log(`✅ categories: ${categories.length} (${parentUpdates} z parentId)`);

  // ---- PRODUCTS ----
  const products = loadJson("products.json");
  const mfrIds = new Set(manufacturers.map((m: any) => m.id));
  const catIds = new Set(categories.map((c: any) => c.id));

  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    try {
      const ownStore = p.marketplaces?.ownStore;
      const price = ownStore?.price ?? p.price;
      const manufacturerId =
        p.manufacturer_id && mfrIds.has(p.manufacturer_id)
          ? p.manufacturer_id
          : null;

      await prisma.product.create({
        data: {
          id: p.id,
          name: p.name,
          manufacturer: p.manufacturer || "",
          manufacturerId,
          price,
          power: p.power || { value: "", range: "" },
          rpm: p.rpm || { value: "", range: "" },
          condition: p.condition || "uzywany",
          shaftDiameter: p.shaftDiameter ?? 0,
          sleeveDiameter: p.sleeveDiameter ?? null,
          flangeSize: p.flangeSize ?? null,
          flangeBoltCircle: p.flangeBoltCircle ?? null,
          mechanicalSize: p.mechanicalSize ?? 0,
          weight: p.weight ?? null,
          legSpacing: p.legSpacing ?? null,
          hasEx: p.hasEx ?? false,
          hasBreak: p.hasBreak ?? false,
          hasForeignCooling: p.hasForeignCooling ?? false,
          startType: p.startType ?? null,
          images: Array.isArray(p.images) ? p.images : [],
          mainImage: p.mainImage ?? null,
          galleryImages: Array.isArray(p.galleryImages) ? p.galleryImages : [],
          stock: p.stock ?? 0,
          description: p.description ?? null,
          technicalDetails: p.technicalDetails ?? null,
          dataSheets: Array.isArray(p.dataSheets) ? p.dataSheets : [],
          marketplaces: p.marketplaces || {},
          attributes: p.attributes ?? null,
          customParameters: p.customParameters ?? null,
          matchedStoreProduct: p.matched_store_product ?? null,
          matchedOlxAdvert: p.matched_olx_advert ?? null,
          viewCount: p.viewCount ?? 0,
          purchaseCount: p.purchaseCount ?? 0,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
        },
      });

      // Product <-> Category
      const categoryIds: string[] = p.category_ids || [];
      for (const catId of categoryIds) {
        if (catIds.has(catId)) {
          await prisma.productCategory
            .create({
              data: { productId: p.id, categoryId: catId },
            })
            .catch(() => {});
        }
      }

      imported++;
    } catch (err: any) {
      skipped++;
      if (skipped <= 5) {
        console.error(`  ⚠️ Pominięto ${p.id}: ${err.message}`);
      }
    }

    if ((i + 1) % 500 === 0) {
      log(`  ... ${i + 1}/${products.length}`);
    }
  }
  stats.products = imported;
  stats.skipped = skipped;
  log(`✅ products: ${imported}${skipped ? ` (pominięto: ${skipped})` : ""}`);

  // ---- ORDERS ----
  const orders = loadJson("orders.json");
  let ordersOk = 0;
  for (const o of orders) {
    try {
      await prisma.order.create({
        data: {
          id: o.id,
          orderNumber: o.orderNumber ?? null,
          items: o.items || [],
          shipping: o.shipping || {},
          shippingDate: o.shippingDate ? new Date(o.shippingDate) : null,
          subtotal: o.subtotal ?? 0,
          shippingCost: o.shippingCost ?? 0,
          total: o.total ?? 0,
          totalWeight:
            o.totalWeight && !isNaN(Number(o.totalWeight)) ? o.totalWeight : 0,
          status: o.status || "pending",
          paymentMethod: o.paymentMethod || "prepaid",
          paymentDetails: o.paymentDetails ?? null,
          paymentIntentId: o.paymentIntentId ?? null,
          isStockReserved: o.isStockReserved ?? false,
          stripeSessionId: o.stripeSessionId ?? null,
          invoiceUrls: o.invoiceUrls || [],
          cancellationReason: o.cancellationReason ?? null,
          cancelledAt: o.cancelledAt ? new Date(o.cancelledAt) : null,
          cancelledBy: o.cancelledBy ?? null,
          expiresAt: o.expiresAt ? new Date(o.expiresAt) : null,
          createdAt: new Date(o.createdAt),
          updatedAt: new Date(o.updatedAt),
        },
      });
      ordersOk++;
    } catch (err: any) {
      if (ordersOk < 3) console.error(`  ⚠️ Order ${o.id}: ${err.message}`);
    }
  }
  stats.orders = ordersOk;
  log(`✅ orders: ${ordersOk}`);

  // ---- BLOG POSTS ----
  const blogPosts = loadJson("blog_posts.json");
  for (const b of blogPosts) {
    let tags: string[] = [];
    if (Array.isArray(b.tags)) tags = b.tags;
    else if (typeof b.tags === "string" && b.tags) {
      tags = b.tags
        .split(",")
        .map((t: string) => t.trim())
        .filter(Boolean);
    }

    await prisma.blogPost.create({
      data: {
        id: b.id,
        title: b.title,
        slug: b.slug,
        content: b.content,
        excerpt: b.excerpt || "",
        author: b.author || "Admin",
        tags,
        featuredImage: b.featuredImage ?? b.featured_image ?? null,
        createdAt: new Date(b.created_at || b.createdAt),
        updatedAt: new Date(b.updated_at || b.updatedAt),
      },
    });
  }
  stats.blogPosts = blogPosts.length;
  log(`✅ blog_posts: ${blogPosts.length}`);

  // ---- LEGAL PAGES ----
  const legalPages = loadJson("legal_pages.json");
  for (const l of legalPages) {
    await prisma.legalPage.create({
      data: {
        id: l.id,
        title: l.title,
        slug: l.slug,
        content: l.content,
        isActive: true,
        createdAt: new Date(l.created_at || l.createdAt),
        updatedAt: new Date(l.updated_at || l.updatedAt),
      },
    });
  }
  stats.legalPages = legalPages.length;
  log(`✅ legal_pages: ${legalPages.length}`);

  // ---- PODSUMOWANIE ----
  console.log("\n" + "=".repeat(60));
  console.log("  PODSUMOWANIE");
  console.log("=".repeat(60));
  for (const [table, count] of Object.entries(stats)) {
    console.log(`  ${table.padEnd(20)} ${count}`);
  }
  console.log("=".repeat(60));
  log("🎉 Gotowe!");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ FATAL:", err);
  process.exit(1);
});
