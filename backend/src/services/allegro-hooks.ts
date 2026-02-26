// backend/src/services/allegro-hooks.ts
// Fire-and-forget hooks for Allegro sync.
// Import these in orders.ts, admin-products.ts, webhooks.ts
// All calls are non-blocking (catch errors internally).

import {
  syncStockToAllegro,
  syncPriceToAllegro,
  syncNameToAllegro,
} from "./allegro-sync.js";

/**
 * Call after stock changes (order placed, cancelled, admin edit).
 * Fire-and-forget — never throws.
 */
export function fireAllegroStockSync(
  productId: string,
  newStock: number,
): void {
  syncStockToAllegro(productId, newStock).catch((err) =>
    console.error(
      `[allegro-hook] stock sync failed for ${productId}:`,
      err.message,
    ),
  );
}

/**
 * Call after price changes (admin edit).
 * Fire-and-forget — never throws.
 */
export function fireAllegroPriceSync(
  productId: string,
  newPrice: number,
): void {
  syncPriceToAllegro(productId, newPrice).catch((err) =>
    console.error(
      `[allegro-hook] price sync failed for ${productId}:`,
      err.message,
    ),
  );
}

/**
 * Call after product name changes (admin edit).
 * Fire-and-forget — never throws.
 */
export function fireAllegroNameSync(productId: string, newName: string): void {
  syncNameToAllegro(productId, newName).catch((err) =>
    console.error(
      `[allegro-hook] name sync failed for ${productId}:`,
      err.message,
    ),
  );
}

/**
 * Call after stock changes for multiple products (e.g. bulk order).
 */
export function fireAllegroStockSyncBatch(
  items: Array<{ productId: string; newStock: number }>,
): void {
  for (const item of items) {
    fireAllegroStockSync(item.productId, item.newStock);
  }
}
