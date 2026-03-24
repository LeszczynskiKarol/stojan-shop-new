/**
 * backend/src/services/rebuild-satellite.ts
 *
 * Event-driven rebuildy WYŁĄCZONE — satelity odświeżane przez cron co 6h.
 * Funkcja zachowana jako no-op żeby nie ruszać importów w orders.ts i admin-products.ts.
 */

export function fireSatelliteRebuild(reason: string, productSlug?: string) {
  console.log(
    `[satellite-rebuild] DISABLED (cron-only mode) — would trigger: ${reason}${productSlug ? ` (${productSlug})` : ""}`,
  );
}
