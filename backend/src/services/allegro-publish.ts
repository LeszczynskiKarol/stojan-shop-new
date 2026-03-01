// backend/src/services/allegro-publish.ts
// Service for publishing shop products as Allegro offers.
// Uses allegro-offer-builder for payload construction
// and allegro-client for API calls.

import { prisma } from "../lib/prisma.js";
import {
  buildAllegroOffer,
  validateForAllegro,
} from "./allegro-offer-builder.js";
import { isAllegroConnected } from "../lib/allegro-client.js";
import { allegroConfig } from "../config/allegro.config.js";

// ============================================
// TYPES
// ============================================
interface PublishResult {
  success: boolean;
  allegroOfferId?: string;
  allegroUrl?: string;
  error?: string;
  validationErrors?: string[];
}

// ============================================
// CREATE OFFER ON ALLEGRO API
// ============================================
async function createAllegroOffer(payload: any): Promise<any> {
  const connected = await isAllegroConnected();
  if (!connected) {
    throw new Error("Allegro nie jest połączone. Zaloguj się najpierw.");
  }

  // Get valid token from DB
  const tokenRecord = await prisma.allegroToken.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!tokenRecord) {
    throw new Error("Brak tokenu Allegro. Wymagana autoryzacja.");
  }

  // Check if token needs refresh
  let accessToken = tokenRecord.accessToken;
  const expiresAt = new Date(tokenRecord.expiresAt);

  if (expiresAt <= new Date()) {
    // Refresh token
    const refreshResult = await refreshAllegroToken(tokenRecord.refreshToken);
    accessToken = refreshResult.access_token;
  }

  // POST to Allegro Sale API
  const response = await fetch(`${allegroConfig.apiUrl}/sale/product-offers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/vnd.allegro.public.v1+json",
      Accept: "application/vnd.allegro.public.v1+json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessages =
      errorData.errors
        ?.map((e: any) => e.userMessage || e.message || JSON.stringify(e))
        .join("; ") || `HTTP ${response.status}`;

    console.error("❌ Allegro API error:", JSON.stringify(errorData, null, 2));
    throw new Error(`Allegro API: ${errorMessages}`);
  }

  return response.json();
}

async function refreshAllegroToken(
  refreshToken: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const basicAuth = Buffer.from(
    `${allegroConfig.clientId}:${allegroConfig.clientSecret}`,
  ).toString("base64");

  const response = await fetch(`${allegroConfig.authUrl}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error("Nie udało się odświeżyć tokenu Allegro");
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Save refreshed token
  await prisma.allegroToken.updateMany({
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  });

  return data;
}

// ============================================
// PUBLISH PRODUCT TO ALLEGRO
// ============================================

/**
 * Publish an existing shop product to Allegro.
 * Creates a new Allegro offer and links it to the product.
 *
 * @param productId - Shop product ID
 * @param overrides - Optional overrides (allegroPrice, allegroDescription, model)
 */
export async function publishProductToAllegro(
  productId: string,
  overrides?: {
    allegroPrice?: number;
    allegroDescription?: string;
    model?: string;
  },
): Promise<PublishResult> {
  // 1. Load product with categories
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      categories: {
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  if (!product) {
    return { success: false, error: "Produkt nie znaleziony" };
  }

  // Check if already linked
  const mp = product.marketplaces as any;
  if (mp?.allegro?.productId) {
    return {
      success: false,
      error: `Produkt już jest na Allegro (ID: ${mp.allegro.productId})`,
    };
  }

  // 2. Map to builder format
  const productData = {
    id: product.id,
    name: product.name,
    manufacturer: product.manufacturer,
    condition: product.condition,
    price: Number(product.price),
    stock: product.stock,
    power: product.power as { value: string; range?: string } | null,
    rpm: product.rpm as { value: string; range?: string } | null,
    weight: product.weight ? Number(product.weight) : null,
    shaftDiameter: Number(product.shaftDiameter),
    sleeveDiameter: product.sleeveDiameter
      ? Number(product.sleeveDiameter)
      : null,
    mechanicalSize: product.mechanicalSize,
    mainImage: product.mainImage,
    galleryImages: product.galleryImages,
    description: product.description,
    startType: product.startType,
    hasBreak: product.hasBreak,
    categories: product.categories.map((pc: any) => ({
      slug: pc.category?.slug || "",
      name: pc.category?.name || "",
    })),
    // Overrides
    allegroPrice: overrides?.allegroPrice,
    allegroDescription: overrides?.allegroDescription,
    model: overrides?.model,
  };

  // 3. Validate
  const validation = validateForAllegro(productData);
  if (!validation.valid) {
    console.error(
      `❌ Allegro validation failed for "${productData.name}":`,
      validation.errors,
    );
    console.error(`   productData snapshot:`, {
      name: productData.name,
      mainImage: productData.mainImage,
      galleryImages: productData.galleryImages,
      price: productData.price,
      categories: productData.categories,
      stock: productData.stock,
    });
    return {
      success: false,
      error: `Walidacja nie przeszła: ${validation.errors.join(", ")}`,
      validationErrors: validation.errors,
    };
  }

  // 4. Build Allegro payload
  let payload;
  try {
    payload = buildAllegroOffer(productData);
  } catch (err: any) {
    return { success: false, error: `Błąd budowania oferty: ${err.message}` };
  }

  // 5. Inject GPSR fields (same as old shop)
  payload.productSet[0].responsibleProducer = {
    type: "NAME",
    name: process.env.ALLEGRO_PRODUCER_NAME || "Stojan s.c.",
  };
  payload.productSet[0].safetyInformation = {
    type: "TEXT",
    description:
      "Produkt spełnia wszystkie wymagania bezpieczeństwa UE. Przed użyciem zapoznaj się z instrukcją obsługi.",
  };

  console.log(
    `🅰️ Publishing "${product.name}" to Allegro (category: ${payload.category.id})`,
  );
  console.log(`🔍 DEBUG overrides:`, JSON.stringify(overrides));
  console.log(`🔍 DEBUG productData.model:`, productData.model);
  console.log(
    `🔍 DEBUG productSet params:`,
    JSON.stringify(payload.productSet[0].product.parameters, null, 2),
  );

  // 5. Create offer on Allegro
  let allegroResponse;
  try {
    allegroResponse = await createAllegroOffer(payload);
  } catch (err: any) {
    return { success: false, error: err.message };
  }

  const allegroOfferId = allegroResponse.id;
  if (!allegroOfferId) {
    return {
      success: false,
      error: "Allegro nie zwróciło ID oferty",
    };
  }

  const allegroUrl = `https://allegro.pl/oferta/${allegroOfferId}`;

  // 6. Update product with Allegro link
  const currentMp = (product.marketplaces as any) || {};
  await prisma.product.update({
    where: { id: productId },
    data: {
      marketplaces: {
        ...currentMp,
        allegro: {
          active: true,
          productId: allegroOfferId,
          url: allegroUrl,
          price: overrides?.allegroPrice || Number(product.price),
          lastSyncAt: new Date().toISOString(),
        },
      },
    },
  });

  console.log(`✅ Published "${product.name}" to Allegro: ${allegroOfferId}`);

  return {
    success: true,
    allegroOfferId,
    allegroUrl,
  };
}

/**
 * Create product in shop AND publish to Allegro in one go.
 * Used by POST /api/admin/products when addToAllegro=true.
 *
 * @param shopProductId - ID of the just-created shop product
 * @param overrides - Allegro-specific overrides from the form
 */
export async function publishNewProductToAllegro(
  shopProductId: string,
  overrides?: {
    allegroPrice?: number;
    allegroDescription?: string;
    model?: string;
  },
): Promise<PublishResult> {
  return publishProductToAllegro(shopProductId, overrides);
}

/**
 * Send raw offer payload to Allegro.
 * For advanced use — caller builds the full payload.
 */
export async function createRawAllegroOffer(
  payload: any,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const data = await createAllegroOffer(payload);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
