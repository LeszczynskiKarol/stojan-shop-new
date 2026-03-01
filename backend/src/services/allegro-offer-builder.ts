// backend/src/services/allegro-offer-builder.ts
// Builds Allegro offer payload from shop product data.
// Handles parameter mapping, description formatting, shipping rate selection.

import {
  ALLEGRO_CATEGORIES,
  ALLEGRO_PARAMS,
  getShippingRateId,
} from "../config/allegro.config.js";
import { ALLEGRO_MANUFACTURERS } from "../config/allegro-manufacturers.js";

// ============================================
// TYPES
// ============================================
interface ProductData {
  id: string;
  name: string;
  manufacturer: string;
  condition: string; // "nowy" | "uzywany" | "nieuzywany"
  price: number;
  stock: number;
  power: { value: string; range?: string } | null;
  rpm: { value: string; range?: string } | null;
  weight: number | null;
  shaftDiameter: number;
  sleeveDiameter: number | null;
  mechanicalSize: number;
  mainImage: string | null;
  galleryImages: string[];
  description: string | null;
  startType: string | null;
  hasBreak: boolean;
  categories: Array<{ slug: string; name: string }>;
  // Optional overrides for Allegro
  allegroPrice?: number;
  allegroDescription?: string;
  model?: string;
}

interface AllegroOfferPayload {
  name: string;
  productSet: Array<{
    product: {
      name: string;
      images: string[];
      parameters: Array<{
        id: string;
        name: string;
        values: string[];
        valuesIds?: string[];
      }>;
    };
    responsibleProducer?: {
      type: "ID" | "NAME";
      id?: string;
      name?: string;
    };
    safetyInformation?: {
      type: "TEXT" | "ATTACHMENTS" | "NO_SAFETY_INFORMATION";
      description?: string;
    };
  }>;
  parameters: Array<{
    id: string;
    name: string;
    values: string[];
    valuesIds?: string[];
  }>;
  images: string[];
  category: { id: string };
  description: {
    sections: Array<{
      items: Array<{ type: string; content?: string; url?: string }>;
    }>;
  };
  sellingMode: {
    format: string;
    price: { amount: string; currency: string };
  };
  stock: { available: number; unit: string };
  delivery: {
    handlingTime: string;
    shippingRates: { id: string };
  };
  location: {
    city: string;
    postCode: string;
    countryCode: string;
    province: string;
  };
}

// ============================================
// MANUFACTURER -> ALLEGRO MARKA MAPPING
// ============================================
// Full mapping imported from allegro-manufacturers.ts (same as old shop).
// Format: { "ABB": "248811_949836", "SEW": "248811_321877", ... }

function getManufacturerParam(manufacturerName: string): {
  id: string;
  value: string;
  valueId: string;
} {
  const name = (manufacturerName || "").trim();
  if (!name) {
    return { id: "248811", value: "Stojan", valueId: "248811_2025307" };
  }

  // Case-insensitive lookup in full Allegro manufacturers dictionary
  const lowerName = name.toLowerCase();
  for (const [key, valueId] of Object.entries(ALLEGRO_MANUFACTURERS)) {
    if (key.toLowerCase() === lowerName) {
      return { id: "248811", value: key, valueId };
    }
  }

  // Not found in dictionary -> fallback to "Stojan"
  console.log(
    `\u26a0\ufe0f Manufacturer "${name}" not in Allegro dictionary -> using Stojan`,
  );
  return { id: "248811", value: "Stojan", valueId: "248811_2025307" };
}

// ============================================
// CATEGORY DETECTION
// ============================================
const MOTOREDUKTOR_SLUGS = ["motoreduktory", "motoreduktor"];

function isMotoreduktor(categories: Array<{ slug: string }>): boolean {
  return categories.some((c) =>
    MOTOREDUKTOR_SLUGS.some((s) => c.slug.includes(s)),
  );
}

function getAllegroCategory(categories: Array<{ slug: string }>): string {
  return isMotoreduktor(categories)
    ? ALLEGRO_CATEGORIES.MOTOREDUKTORY
    : ALLEGRO_CATEGORIES.SILNIKI;
}

// ============================================
// PARAMETER BUILDING
// ============================================

function buildSilnikiParameters(product: ProductData): Array<{
  id: string;
  name: string;
  values: string[];
  valuesIds?: string[];
}> {
  const params: Array<{
    id: string;
    name: string;
    values: string[];
    valuesIds?: string[];
  }> = [];

  const P = ALLEGRO_PARAMS.SILNIKI;

  // Moc [kW]
  if (product.power?.value) {
    params.push({
      id: P.MOC,
      name: "Moc",
      values: [product.power.value.replace(/\s*kW\s*/gi, "").trim()],
    });
  }

  // Obroty [obr/min]
  if (product.rpm?.value) {
    params.push({
      id: P.OBROTY,
      name: "Obroty",
      values: [product.rpm.value.replace(/\s*obr.*$/gi, "").trim()],
    });
  }

  // Napięcie - detect from startType
  const voltage = detectVoltage(product.startType);
  if (voltage) {
    params.push({
      id: P.NAPIECIE,
      name: "Napięcie (V)",
      values: [voltage],
    });
  }

  // Waga [kg]
  const weightNum = product.weight ? Number(product.weight) : 0;
  if (weightNum > 0) {
    params.push({
      id: P.WAGA,
      name: "Waga",
      values: [weightNum.toString()],
    });
  }

  // Średnica wału [mm]
  if (product.shaftDiameter && product.shaftDiameter > 0) {
    params.push({
      id: P.SREDNICA_WALU,
      name: "Średnica wału",
      values: [product.shaftDiameter.toString()],
    });
  }

  // Model — WYMAGANE przez Allegro! Zawsze wysyłaj z fallbackiem
  const modelValue =
    product.model ||
    product.mechanicalSize?.toString() ||
    `S-${product.id.slice(0, 8)}`;
  params.push({ id: P.MODEL, name: "Model", values: [modelValue] });

  // Kod producenta
  params.push({
    id: "224017",
    name: "Kod producenta",
    values: [modelValue],
  });

  // Marka (producent) — known → proper valueId, unknown → "Stojan"
  const mfg = getManufacturerParam(product.manufacturer);
  params.push({
    id: mfg.id,
    name: "Marka",
    values: [mfg.value],
    valuesIds: [mfg.valueId],
  });

  // Rodzaj silnika = elektryczny
  params.push({
    id: "219157",
    name: "Rodzaj silnika",
    values: ["elektryczny"],
    valuesIds: ["219157_284941"],
  });

  return params;
}

function buildMotoreduktoryParameters(product: ProductData): Array<{
  id: string;
  name: string;
  values: string[];
  valuesIds?: string[];
}> {
  const params: Array<{
    id: string;
    name: string;
    values: string[];
    valuesIds?: string[];
  }> = [];

  const P = ALLEGRO_PARAMS.MOTOREDUKTORY;

  // Moc znamionowa — Allegro expects WATTS for motoreduktory!
  if (product.power?.value) {
    const kw = parseFloat(product.power.value.replace(",", ".")) || 0;
    const watts = Math.round(kw * 1000);
    params.push({
      id: P.MOC_ZNAMIONOWA,
      name: "Moc znamionowa",
      values: [watts.toString()],
    });
  }

  // Prędkość obrotowa
  if (product.rpm?.value) {
    params.push({
      id: P.OBROTY,
      name: "Prędkość obrotowa",
      values: [product.rpm.value.replace(/\s*obr.*$/gi, "").trim()],
    });
  }

  // Waga
  const weightNum2 = product.weight ? Number(product.weight) : 0;
  if (weightNum2 > 0) {
    params.push({
      id: P.WAGA,
      name: "Waga",
      values: [weightNum2.toString()],
    });
  }

  // Średnica wału
  if (product.shaftDiameter && product.shaftDiameter > 0) {
    params.push({
      id: P.SREDNICA_WALU,
      name: "Średnica wału",
      values: [product.shaftDiameter.toString()],
    });
  }

  // Model — WYMAGANE przez Allegro! Zawsze wysyłaj z fallbackiem
  const modelValue =
    product.model ||
    product.mechanicalSize?.toString() ||
    `MR-${product.id.slice(0, 8)}`;
  params.push({ id: P.MODEL, name: "Model", values: [modelValue] });

  // Kod producenta
  params.push({
    id: "224017",
    name: "Kod producenta",
    values: [modelValue],
  });

  // Marka — known → proper valueId, unknown → "Stojan"
  const mfg = getManufacturerParam(product.manufacturer);
  params.push({
    id: mfg.id,
    name: "Marka",
    values: [mfg.value],
    valuesIds: [mfg.valueId],
  });

  // Rodzaj motoreduktora = walcowy
  params.push({
    id: P.RODZAJ,
    name: "Rodzaj motoreduktora",
    values: ["walcowy"],
    valuesIds: ["18654_1"],
  });

  return params;
}

// ============================================
// VOLTAGE DETECTION from startType
// ============================================
function detectVoltage(startType: string | null): string | null {
  if (!startType) return null;
  // "bezpośredni - 230/400V" → "230/400"
  // "gwiazda-trójkąt - 400/690V" → "400/690"
  const match = startType.match(/(\d+\/?\d*)\s*V/i);
  return match ? match[1] : null;
}

// ============================================
// DESCRIPTION BUILDER
// ============================================
function buildAllegroDescription(product: ProductData): {
  sections: Array<{
    items: Array<{ type: string; content?: string; url?: string }>;
  }>;
} {
  // Use allegroDescription if provided, otherwise shop description
  const rawDesc = product.allegroDescription || product.description || "";

  // Build HTML content
  let htmlContent = `<h2>${escapeHtml(product.name)}</h2>`;

  if (rawDesc) {
    // If already contains HTML tags, use as-is
    if (/<[a-z][\s\S]*>/i.test(rawDesc)) {
      htmlContent += rawDesc;
    } else {
      // Plain text → convert lines to <p> tags
      htmlContent += rawDesc
        .split("\n")
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0)
        .map((line: string) => `<p>${escapeHtml(line)}</p>`)
        .join("");
    }
  }

  // Build technical details section
  const techLines: string[] = [];
  if (product.power?.value) techLines.push(`Moc: ${product.power.value} kW`);
  if (product.rpm?.value)
    techLines.push(`Obroty: ${product.rpm.value} obr./min`);
  if (product.weight) techLines.push(`Waga: ${Number(product.weight)} kg`);
  if (product.shaftDiameter)
    techLines.push(`Średnica wału: ${product.shaftDiameter} mm`);
  if (product.sleeveDiameter)
    techLines.push(`Średnica tulei: ${product.sleeveDiameter} mm`);
  if (product.mechanicalSize)
    techLines.push(`Wielkość mechaniczna: ${product.mechanicalSize}`);
  if (product.startType) techLines.push(`Rozruch: ${product.startType}`);
  if (product.hasBreak) techLines.push(`Hamulec: tak`);

  if (techLines.length > 0 && !rawDesc) {
    // Only add tech details if no description provided
    htmlContent += `<h2>Parametry techniczne</h2>`;
    htmlContent += techLines.map((l) => `<p>${escapeHtml(l)}</p>`).join("");
  }

  // Build sections with items
  const items: Array<{ type: string; content?: string; url?: string }> = [
    { type: "TEXT", content: htmlContent },
  ];

  // Add main image to description
  if (product.mainImage) {
    items.push({ type: "IMAGE", url: product.mainImage });
  }

  return { sections: [{ items }] };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================
// IMAGES BUILDER
// ============================================
function buildImages(product: ProductData): string[] {
  const urls: string[] = [];
  if (product.mainImage) urls.push(product.mainImage);
  if (product.galleryImages?.length) {
    urls.push(...product.galleryImages);
  }
  if (urls.length === 0) {
    throw new Error("Allegro wymaga co najmniej 1 zdjęcia");
  }
  return urls;
}

// ============================================
// MAIN BUILDER
// ============================================
export function buildAllegroOffer(product: ProductData): AllegroOfferPayload {
  const categoryId = getAllegroCategory(product.categories);
  const isMotored = isMotoreduktor(product.categories);
  const images = buildImages(product);

  // Product-level parameters (technical specs)
  const productParameters = isMotored
    ? buildMotoreduktoryParameters(product)
    : buildSilnikiParameters(product);

  // Offer-level parameters (just condition)
  const conditionValue = product.condition === "uzywany" ? "Używany" : "Nowy";
  const conditionValueId =
    product.condition === "uzywany"
      ? ALLEGRO_PARAMS.CONDITION_USED
      : ALLEGRO_PARAMS.CONDITION_NEW;

  // Price — use allegroPrice override if set, otherwise shop price
  const price = product.allegroPrice || product.price;
  if (!price || price <= 0) {
    throw new Error("Cena musi być większa od 0");
  }

  // Stock
  const stock = product.stock > 0 ? product.stock : 1;

  // Weight for shipping (Prisma Decimal -> number conversion)
  const rawWeight = product.weight ? Number(product.weight) : null;
  const weightKg = rawWeight && rawWeight > 0 ? rawWeight : 10;
  console.log(
    `📦 Shipping: weight=${product.weight} -> rawWeight=${rawWeight} -> weightKg=${weightKg} -> rateId=${getShippingRateId(weightKg)}`,
  );

  // Truncate name to 75 chars (Allegro limit)
  const name = product.name.slice(0, 75);

  // images is already string[] — Allegro wants plain URLs everywhere
  return {
    name,
    productSet: [
      {
        product: {
          name,
          images,
          parameters: productParameters,
        },
      },
    ],
    parameters: [
      {
        id: ALLEGRO_PARAMS.CONDITION,
        name: "Stan",
        values: [conditionValue],
        valuesIds: [conditionValueId],
      },
    ],
    images,
    category: { id: categoryId },
    description: buildAllegroDescription(product),
    sellingMode: {
      format: "BUY_NOW",
      price: { amount: price.toFixed(2), currency: "PLN" },
    },
    stock: { available: stock, unit: "UNIT" },
    delivery: {
      handlingTime: "PT24H",
      shippingRates: { id: getShippingRateId(weightKg) },
    },
    location: {
      city: process.env.ALLEGRO_LOCATION_CITY || "Łubianka",
      postCode: process.env.ALLEGRO_LOCATION_POSTCODE || "87-152",
      countryCode: "PL",
      province: process.env.ALLEGRO_LOCATION_PROVINCE || "KUJAWSKO_POMORSKIE",
    },
  };
}

// ============================================
// VALIDATION
// ============================================
export function validateForAllegro(product: ProductData): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!product.name || product.name.length < 5) {
    errors.push("Nazwa musi mieć min. 5 znaków");
  }
  const wordCount = product.name.trim().split(/\s+/).length;
  if (wordCount < 3) {
    errors.push(
      "Allegro wymaga min. 3 wyrazów w nazwie (np. 'Silnik elektryczny 1,1kW')",
    );
  }
  if (
    !product.mainImage &&
    (!product.galleryImages || product.galleryImages.length === 0)
  ) {
    errors.push("Wymagane co najmniej 1 zdjęcie");
  }
  if (!product.price || product.price <= 0) {
    errors.push("Cena musi być > 0");
  }
  if (!product.categories?.length) {
    errors.push("Wymagana kategoria (silniki/motoreduktory)");
  }

  return { valid: errors.length === 0, errors };
}

export { ALLEGRO_MANUFACTURERS, getManufacturerParam };
