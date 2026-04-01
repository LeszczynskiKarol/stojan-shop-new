// backend/src/routes/google-merchant-feed.ts
// Google Merchant Center XML feed
// URL: GET /api/products/google-merchant-feed
// Registered in products route or separately in index.ts

import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { SHIPPING_RATES } from "../config/shipping.config.js";

// ============================================
// HELPERS
// ============================================

const SITE_URL = "https://www.silniki-elektryczne.com.pl";

const BLACKLIST_PATTERNS = [
  /^ramię reakcyjne\b/i,
  /^kołnierz boczny\b/i,
  /^wał zdawczy\b/i,
  /^wał stalowy\b/i,
  /^reduktor \/ przekładnia ślimakowa/i,
  /^reduktor wstępny/i,
  /^sprzęgło kłowe surowe/i,
];

const SHOPPING_ADS_BLACKLIST = new Set([
  "motoreduktor / przekładnia 0,55kW 97obr. 3fazowy NORD", // CPC 39.78 zł — 1 klik za 40 zł, anomalia
]);

function isBlacklisted(productName: string): boolean {
  if (SHOPPING_ADS_BLACKLIST.has(productName)) return true;
  return BLACKLIST_PATTERNS.some((p) => p.test(productName));
}

function escapeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\*{1,2}/g, "") // usuń markdown bold/italic
    .replace(/#{1,6}\s/g, "") // usuń markdown headers
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDescription(text: string): string {
  const stripped = stripHtml(text);
  // Google Merchant allows max 5000 chars for description
  return escapeXml(stripped.substring(0, 5000));
}

function calculateShippingCost(weight: number): number {
  const rate = SHIPPING_RATES.find(
    (r) => weight >= r.minWeight && weight <= r.maxWeight,
  );
  return rate?.prepaidCost ?? 29;
}

function parsePower(power: any): string {
  if (!power) return "";
  const val = typeof power === "object" ? power.value : String(power);
  return val || "";
}

function parseRpm(rpm: any): string {
  if (!rpm) return "";
  const val = typeof rpm === "object" ? rpm.value : String(rpm);
  return val || "";
}

/**
 * Map product condition to Google's condition values
 */
function mapCondition(condition: string): string {
  return condition === "nowy" ? "new" : "used";
}

/**
 * Map category name to Google Product Category ID
 * https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt
 * 3613 = Industrial Electric Motors
 */
function mapGoogleCategory(categoryName: string): number {
  const lower = (categoryName || "").toLowerCase();

  if (lower.includes("wentylator")) return 505284; // Industrial Fans
  if (lower.includes("motoreduktor")) return 3613;
  if (lower.includes("akcesori")) return 3613;

  // Default: Electric Motors
  return 3613;
}

/**
 * Build category path from product categories
 */
function buildCategoryPath(categories: any[]): string {
  if (!categories || categories.length === 0) return "Silniki elektryczne";
  // Use the first category name
  const cat = categories[0];
  const name = cat?.category?.name || cat?.name || "Silniki elektryczne";
  return name;
}

// ============================================
// ROUTE
// ============================================

export async function googleMerchantFeedRoute(app: FastifyInstance) {
  app.get("/google-merchant-feed", async (request, reply) => {
    // Fetch all in-stock products with ownStore active
    const products = await prisma.product.findMany({
      where: {
        stock: { gt: 0 },
        marketplaces: {
          path: ["ownStore", "active"],
          equals: true,
        },
      },
      include: {
        categories: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const items: string[] = [];

    for (const product of products) {
      const mp = product.marketplaces as any;
      const ownStore = mp?.ownStore;

      // Skip products without price or slug
      const price = Number(ownStore?.price ?? product.price ?? 0);
      if (isNaN(price) || price <= 0) continue;

      const slug = ownStore?.slug;
      if (!slug) continue;

      // Category info
      const categorySlug =
        product.categories?.[0]?.category?.slug || "silniki-elektryczne";
      const categoryName = buildCategoryPath(product.categories);

      // Product URL
      const productUrl = `${SITE_URL}/${categorySlug}/${slug}`;

      // Images
      const mainImage = product.mainImage || product.images?.[0];
      if (!mainImage) continue; // Google requires at least one image

      const imageUrl = mainImage.startsWith("http")
        ? mainImage
        : `${SITE_URL}${mainImage}`;

      // Additional images (up to 10)
      const additionalImages = [
        ...(product.galleryImages || []),
        ...(product.images || []),
      ]
        .filter(
          (img, idx, arr) =>
            img &&
            img !== mainImage &&
            img.startsWith("http") &&
            arr.indexOf(img) === idx,
        )
        .slice(0, 9);

      // Description
      const description = cleanDescription(product.description || product.name);
      const title = escapeXml(product.name);

      // Weight & shipping
      const weight = Number(product.weight) || 0;
      const shippingCost = weight > 0 ? calculateShippingCost(weight) : 29;

      // Power & RPM for custom labels
      const power = parsePower(product.power);
      const rpm = parseRpm(product.rpm);

      // Manufacturer
      const manufacturer = escapeXml(
        product.manufacturer && product.manufacturer.toLowerCase() !== "silnik"
          ? product.manufacturer
          : "Stojan",
      );

      // Build item XML
      let itemXml = `    <item>
      <g:id>${escapeXml(product.id)}</g:id>
      <g:title>${title}</g:title>
      <g:description>${description}</g:description>
      <g:link>${escapeXml(productUrl)}</g:link>
      <g:image_link>${escapeXml(imageUrl)}</g:image_link>`;

      // Additional images
      for (const addImg of additionalImages) {
        itemXml += `\n      <g:additional_image_link>${escapeXml(addImg)}</g:additional_image_link>`;
      }

      itemXml += `
      <g:availability>${product.stock > 0 ? "in_stock" : "out_of_stock"}</g:availability>
      <g:price>${price.toFixed(2)} PLN</g:price>
      <g:brand>${manufacturer}</g:brand>
      <g:condition>${mapCondition(product.condition)}</g:condition>
      <g:identifier_exists>no</g:identifier_exists>
      <g:google_product_category>${mapGoogleCategory(categoryName)}</g:google_product_category>
      <g:product_type>Przemysłowe &gt; ${escapeXml(categoryName)}</g:product_type>
      <g:shipping>
        <g:country>PL</g:country>
        <g:service>Standard</g:service>
        <g:price>${shippingCost.toFixed(2)} PLN</g:price>
      </g:shipping>`;

      if (weight > 0) {
        itemXml += `\n      <g:shipping_weight>${weight} kg</g:shipping_weight>`;
      }

      // Custom labels (up to 5: 0-4)
      if (power) {
        itemXml += `\n      <g:custom_label_0>Moc ${escapeXml(power)}</g:custom_label_0>`;
      }
      if (rpm) {
        itemXml += `\n      <g:custom_label_1>Obroty ${escapeXml(rpm)}</g:custom_label_1>`;
      }
      if (product.mechanicalSize) {
        itemXml += `\n      <g:custom_label_2>Wielkość ${product.mechanicalSize}</g:custom_label_2>`;
      }
      if (product.startType) {
        itemXml += `\n      <g:custom_label_3>Rozruch ${escapeXml(product.startType)}</g:custom_label_3>`;
      }
      if (product.shaftDiameter && Number(product.shaftDiameter) > 0) {
        itemXml += `\n      <g:custom_label_4>Wał ${product.shaftDiameter}mm</g:custom_label_4>`;
      }

      if (isBlacklisted(product.name)) {
        itemXml += `\n      <g:excluded_destination>Shopping_ads</g:excluded_destination>`;
      }

      itemXml += `\n    </item>`;

      items.push(itemXml);
    }

    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Silniki-elektryczne.com.pl</title>
    <link>${SITE_URL}</link>
    <description>Feed produktowy silniki-elektryczne.com.pl</description>
${items.join("\n")}
  </channel>
</rss>`;

    reply.header("Content-Type", "application/xml; charset=utf-8");
    return reply.send(feed);
  });
}
