// backend/src/config/shipping.config.ts

export interface ShippingRate {
  minWeight: number;
  maxWeight: number;
  prepaidCost: number;
  codCost: number | null;
}

export const SHIPPING_RATES: ShippingRate[] = [
  { minWeight: 0, maxWeight: 9, prepaidCost: 19, codCost: 23 },
  { minWeight: 9.5, maxWeight: 27.5, prepaidCost: 27, codCost: 29 },
  { minWeight: 28, maxWeight: 30, prepaidCost: 33, codCost: 35 },
  { minWeight: 30.5, maxWeight: 36.5, prepaidCost: 50, codCost: 60 },
  { minWeight: 37, maxWeight: 90, prepaidCost: 145, codCost: 155 },
  { minWeight: 91, maxWeight: 185, prepaidCost: 165, codCost: 175 },
  { minWeight: 186, maxWeight: 375, prepaidCost: 235, codCost: 245 },
  { minWeight: 376, maxWeight: 575, prepaidCost: 270, codCost: 280 },
  { minWeight: 576, maxWeight: 775, prepaidCost: 290, codCost: null },
  { minWeight: 776, maxWeight: 970, prepaidCost: 315, codCost: null },
  { minWeight: 971, maxWeight: 1470, prepaidCost: 300, codCost: null },
  { minWeight: 1500, maxWeight: 5000, prepaidCost: 500, codCost: null },
];

/**
 * Oblicza koszt wysyłki na podstawie wagi i metody płatności.
 * Zwraca null jeśli brak stawki dla danej wagi/metody.
 */
export function calculateShippingCost(
  totalWeight: number,
  paymentMethod: "prepaid" | "cod",
): number | null {
  const rate = SHIPPING_RATES.find(
    (r) => totalWeight >= r.minWeight && totalWeight <= r.maxWeight,
  );

  if (!rate) return null;

  if (paymentMethod === "cod") {
    return rate.codCost; // null jeśli COD niedostępny
  }

  return rate.prepaidCost;
}

/**
 * Sprawdza czy COD jest dostępny dla danej wagi.
 */
export function isCodAvailable(totalWeight: number): boolean {
  return totalWeight <= 575;
}
