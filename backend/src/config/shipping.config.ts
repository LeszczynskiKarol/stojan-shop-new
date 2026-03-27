// backend/src/config/shipping.config.ts
// Shipping rate configuration
// Defaults are hardcoded below; admin can override via Settings DB table.

export interface ShippingRate {
  minWeight: number;
  maxWeight: number;
  prepaidCost: number;
  codCost: number | null;
}

/**
 * Hardcoded defaults — used as fallback when DB has no custom rates.
 * Admin panel saves overrides to Setting table (key: "shipping_rates").
 */
export const SHIPPING_RATES: ShippingRate[] = [
  { minWeight: 0, maxWeight: 9, prepaidCost: 19, codCost: 23 },
  { minWeight: 9.5, maxWeight: 27.5, prepaidCost: 27, codCost: 29 },
  { minWeight: 28, maxWeight: 36.5, prepaidCost: 50, codCost: 60 },
  { minWeight: 37, maxWeight: 90, prepaidCost: 145, codCost: 155 },
  { minWeight: 91, maxWeight: 185, prepaidCost: 165, codCost: 175 },
  { minWeight: 186, maxWeight: 375, prepaidCost: 235, codCost: 245 },
  { minWeight: 376, maxWeight: 575, prepaidCost: 270, codCost: 280 },
  { minWeight: 576, maxWeight: 775, prepaidCost: 290, codCost: null },
  { minWeight: 776, maxWeight: 970, prepaidCost: 315, codCost: null },
  { minWeight: 971, maxWeight: 1470, prepaidCost: 300, codCost: null },
  { minWeight: 1500, maxWeight: 5000, prepaidCost: 500, codCost: null },
];

// In-memory cache (refreshed every 5 min or on write)
let _cachedRates: ShippingRate[] | null = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Loads active shipping rates: DB override → hardcoded defaults.
 * Cached in memory for 5 min to avoid DB hits on every order calc.
 */
export async function getActiveShippingRates(): Promise<ShippingRate[]> {
  const now = Date.now();
  if (_cachedRates && now - _cacheTime < CACHE_TTL) {
    return _cachedRates;
  }

  try {
    const { getShippingRatesFromDb } =
      await import("../routes/admin-shipping.js");
    const dbRates = await getShippingRatesFromDb();
    _cachedRates = dbRates ?? SHIPPING_RATES;
  } catch {
    // DB unavailable — use defaults
    _cachedRates = SHIPPING_RATES;
  }

  _cacheTime = now;
  return _cachedRates;
}

/** Call after admin saves new rates to bust the cache immediately. */
export function invalidateShippingCache(): void {
  _cachedRates = null;
  _cacheTime = 0;
}

/**
 * Oblicza koszt wysyłki na podstawie wagi i metody płatności.
 * Async version — reads from DB/cache.
 * Zwraca null jeśli brak stawki dla danej wagi/metody.
 */
export async function calculateShippingCostAsync(
  totalWeight: number,
  paymentMethod: "prepaid" | "cod",
): Promise<number | null> {
  const rates = await getActiveShippingRates();
  return calculateFromRates(rates, totalWeight, paymentMethod);
}

/**
 * Synchronous version using hardcoded defaults (legacy compatibility).
 * Use calculateShippingCostAsync() for DB-aware calculation.
 */
export function calculateShippingCost(
  totalWeight: number,
  paymentMethod: "prepaid" | "cod",
): number | null {
  // If cache is warm, use it; otherwise fall back to defaults
  const rates = _cachedRates ?? SHIPPING_RATES;
  return calculateFromRates(rates, totalWeight, paymentMethod);
}

function calculateFromRates(
  rates: ShippingRate[],
  totalWeight: number,
  paymentMethod: "prepaid" | "cod",
): number | null {
  const rate = rates.find(
    (r) => totalWeight >= r.minWeight && totalWeight <= r.maxWeight,
  );
  if (!rate) return null;
  if (paymentMethod === "cod") return rate.codCost;
  return rate.prepaidCost;
}

/**
 * Sprawdza czy COD jest dostępny dla danej wagi.
 */
export async function isCodAvailableAsync(
  totalWeight: number,
): Promise<boolean> {
  const rates = await getActiveShippingRates();
  const rate = rates.find(
    (r) => totalWeight >= r.minWeight && totalWeight <= r.maxWeight,
  );
  return rate?.codCost !== null && rate?.codCost !== undefined;
}

export function isCodAvailable(totalWeight: number): boolean {
  const rates = _cachedRates ?? SHIPPING_RATES;
  const rate = rates.find(
    (r) => totalWeight >= r.minWeight && totalWeight <= r.maxWeight,
  );
  return rate?.codCost !== null && rate?.codCost !== undefined;
}
