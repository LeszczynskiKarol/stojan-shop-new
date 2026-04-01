// backend/src/services/fedex-hooks.ts
// Fire-and-forget hooks for FedEx integration
// Pattern: analogiczny do allegro-hooks.ts

import { isFedExEligible } from "../lib/fedex-client.js";
import { createFedExShipmentFromOrder } from "./fedex-service.js";

/**
 * Fire-and-forget: automatycznie tworzy przesyłkę FedEx
 * gdy zamówienie zmienia status na "shipped".
 *
 * Wywoływana w PATCH /:id/status w orders.ts.
 * Nie blokuje response — działa w tle.
 */
export function fireAutoFedExShipment(
  orderId: string,
  totalWeightKg: number,
): void {
  // Nie odpala się jeśli waga poza zakresem FedEx
  if (!isFedExEligible(totalWeightKg)) {
    console.log(
      `⏭️ FedEx skip: order ${orderId}, waga ${totalWeightKg} kg > limit`,
    );
    return;
  }

  // Fire-and-forget — nie czekamy na wynik
  createFedExShipmentFromOrder(orderId)
    .then((result) => {
      if (result.success) {
        console.log(
          `📦 FedEx auto-ship OK: order=${orderId}, tracking=${result.trackingNumber}`,
        );
      } else {
        console.warn(
          `⚠️ FedEx auto-ship failed: order=${orderId}, error=${result.error}`,
        );
      }
    })
    .catch((err) => {
      console.error(`❌ FedEx auto-ship error: order=${orderId}`, err.message);
    });
}
