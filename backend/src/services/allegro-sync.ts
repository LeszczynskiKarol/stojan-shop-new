// backend/src/services/allegro-sync.ts
// Business logic for bidirectional Allegro ↔ Shop synchronization
// Called from routes, order hooks, and scheduled tasks

import { prisma } from "../lib/prisma.js";
import {
  patchOffer,
  getOffer,
  getSellerOffers,
  getOfferEvents,
  endOffer,
  activateOffer,
  isAllegroConnected,
} from "../lib/allegro-client.js";

const log = (msg: string): void =>
  console.log(`[${new Date().toISOString()}] ${msg}`);

// ============================================
// TYPES
// ============================================
interface SyncResult {
  success: boolean;
  synced: number;
  errors: string[];
}

// ============================================
// SHOP → ALLEGRO (push changes to Allegro)
// ============================================

/**
 * Sync stock for a single product to Allegro
 */
export async function syncStockToAllegro(
  productId: string,
  newStock: number,
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, marketplaces: true },
  });

  if (!product) return;

  const mp = product.marketplaces as any;
  const allegroId = mp?.allegro?.productId;
  if (!allegroId) return;

  const connected = await isAllegroConnected();
  if (!connected) {
    console.warn("⚠️ Allegro not connected, skipping stock sync");
    return;
  }

  try {
    if (newStock <= 0) {
      if (mp?.allegro?.active === false) {
        log(`ℹ️ Offer ${allegroId} already ended, skipping`);
        return; // ← NOWE
      }

      // First set stock to 0, then end (deactivate) offer
      await patchOffer(allegroId, {
        stock: { available: 0, unit: "UNIT" },
      });
      await endOffer(allegroId);

      await prisma.product.update({
        where: { id: productId },
        data: {
          marketplaces: {
            ...mp,
            allegro: {
              ...mp.allegro,
              active: false,
              lastSyncAt: new Date().toISOString(),
            },
          },
        },
      });
    } else {
      // ✅ FIX: reactivate FIRST
      if (mp?.allegro?.active === false) {
        try {
          await activateOffer(allegroId);
          log(`✅ Reactivated Allegro offer ${allegroId}`);
          await new Promise((r) => setTimeout(r, 1500));
        } catch (err: any) {
          console.warn(`⚠️ Could not reactivate ${allegroId}:`, err.message);
          return; // ← nie próbuj PATCH jeśli activate failuje
        }
      }

      await patchOffer(allegroId, {
        stock: { available: newStock, unit: "UNIT" },
      });

      await prisma.product.update({
        where: { id: productId },
        data: {
          marketplaces: {
            ...mp,
            allegro: {
              ...mp.allegro,
              active: true,
              lastSyncAt: new Date().toISOString(),
            },
          },
        },
      });
    }

    log(`✅ Allegro stock synced: ${allegroId} → ${newStock}`);
  } catch (err: any) {
    console.error(
      `❌ Failed to sync stock to Allegro for ${productId}:`,
      err.message,
    );
  }
}

/**
 * Sync price for a single product to Allegro
 */
export async function syncPriceToAllegro(
  productId: string,
  newPrice: number,
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, marketplaces: true },
  });

  if (!product) return;

  const mp = product.marketplaces as any;
  const allegroId = mp?.allegro?.productId;
  if (!allegroId) return;
  if (mp?.allegro?.active === false) {
    log(`ℹ️ Offer ${allegroId} is ended, skipping price sync`);
    return;
  }
  const connected = await isAllegroConnected();
  if (!connected) return;

  try {
    log(`💰 Syncing price to Allegro: ${allegroId} → ${newPrice} PLN`);

    await patchOffer(allegroId, {
      sellingMode: {
        price: { amount: String(newPrice), currency: "PLN" },
      },
    });

    await prisma.product.update({
      where: { id: productId },
      data: {
        marketplaces: {
          ...mp,
          allegro: {
            ...mp.allegro,
            price: newPrice,
            lastSyncAt: new Date().toISOString(),
          },
        },
      },
    });

    log(`✅ Allegro price synced: ${allegroId} → ${newPrice}`);
  } catch (err: any) {
    console.error(
      `❌ Failed to sync price to Allegro for ${productId}:`,
      err.message,
    );
  }
}

/**
 * Sync name for a single product to Allegro
 */
export async function syncNameToAllegro(
  productId: string,
  newName: string,
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { marketplaces: true },
  });

  if (!product) return;

  const mp = product.marketplaces as any;
  const allegroId = mp?.allegro?.productId;
  if (!allegroId) return;

  const connected = await isAllegroConnected();
  if (!connected) return;

  try {
    const truncated = newName.slice(0, 75);
    await patchOffer(allegroId, { name: truncated });
    log(`✅ Allegro name synced: ${allegroId}`);
  } catch (err: any) {
    console.error(
      `❌ Failed to sync name to Allegro for ${productId}:`,
      err.message,
    );
  }
}

// ============================================
// ALLEGRO → SHOP (pull changes from Allegro)
// ============================================

async function getLastEventId(): Promise<string | null> {
  const setting = await prisma.setting.findUnique({
    where: { key: "allegro_last_event_id" },
  });
  return setting?.value || null;
}

async function saveLastEventId(id: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key: "allegro_last_event_id" },
    update: { value: id },
    create: { key: "allegro_last_event_id", value: id },
  });
}

/**
 * Poll Allegro offer events and sync changes back to shop.
 * ✅ FIX: Removed duplicated event processing loop
 */
export async function pollAllegroEvents(): Promise<SyncResult> {
  const result: SyncResult = { success: true, synced: 0, errors: [] };

  const connected = await isAllegroConnected();
  if (!connected) {
    result.success = false;
    result.errors.push("Allegro not connected");
    return result;
  }

  try {
    const lastEventId = await getLastEventId();
    const events = await getOfferEvents({
      from: lastEventId || undefined,

      limit: 100,
      type: ["OFFER_STOCK_CHANGED", "OFFER_PRICE_CHANGED"],
    });

    if (!events?.offerEvents?.length) {
      return result;
    }

    log(`📡 Got ${events.offerEvents.length} events from Allegro`);

    // ✅ Single loop — process each event once
    for (const event of events.offerEvents) {
      try {
        const allegroOfferId = event.offer?.id;
        if (!allegroOfferId) continue;

        // Find linked product in our DB
        const product = await prisma.product.findFirst({
          where: {
            marketplaces: {
              path: ["allegro", "productId"],
              equals: allegroOfferId,
            },
          },
        });

        if (!product) continue;

        // Fetch current state from Allegro (event payload may be incomplete)
        const offer = await getOffer(allegroOfferId);
        const mp = product.marketplaces as any;

        if (event.type === "OFFER_STOCK_CHANGED") {
          const newStock = offer.stock?.available ?? 0;
          if (newStock !== product.stock) {
            log(
              `📥 Allegro stock event: "${product.name}" ${product.stock} → ${newStock}`,
            );
            await prisma.product.update({
              where: { id: product.id },
              data: {
                stock: newStock,
                marketplaces: {
                  ...mp,
                  allegro: {
                    ...mp.allegro,
                    active: newStock > 0,
                    lastSyncAt: new Date().toISOString(),
                  },
                },
              },
            });
            result.synced++;
          }
        }

        if (event.type === "OFFER_PRICE_CHANGED") {
          const newPrice = parseFloat(offer.sellingMode?.price?.amount || "0");
          if (newPrice > 0) {
            const currentPrice = Number(product.price);
            if (newPrice !== currentPrice) {
              log(
                `📥 Allegro price event: "${product.name}" ${currentPrice} → ${newPrice}`,
              );
              await prisma.product.update({
                where: { id: product.id },
                data: {
                  price: newPrice,
                  marketplaces: {
                    ...mp,
                    allegro: {
                      ...mp.allegro,
                      price: newPrice,
                      lastSyncAt: new Date().toISOString(),
                    },
                  },
                },
              });
              result.synced++;
            }
          }
        }

        await saveLastEventId(event.id);

        // Rate limit between Allegro API calls
        await new Promise((r) => setTimeout(r, 200));
      } catch (err: any) {
        result.errors.push(`Event ${event.id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    result.success = false;
    result.errors.push(err.message);
    console.error("❌ Allegro event polling failed:", err.message);
  }

  return result;
}

// ============================================
// IMPORT / MATCH (link Allegro offers to products — NEVER creates new products)
// ============================================

/**
 * Import all Allegro offers and match/link them to shop products by name.
 * ONLY links — never creates new products.
 */
export async function importAllegroOffers(): Promise<{
  total: number;
  matched: number;
  skipped: number;
  errors: string[];
}> {
  const result = { total: 0, matched: 0, skipped: 0, errors: [] as string[] };

  const connected = await isAllegroConnected();
  if (!connected) {
    result.errors.push("Allegro not connected");
    return result;
  }

  try {
    let offset = 0;
    const limit = 100;
    let allOffers: any[] = [];

    while (true) {
      const response = await getSellerOffers(offset, limit);
      allOffers = allOffers.concat(response.offers || []);
      result.total = response.totalCount;

      if (offset + limit >= response.totalCount) break;
      offset += limit;
      await new Promise((r) => setTimeout(r, 200));
    }

    log(`📦 Fetched ${allOffers.length} offers from Allegro`);

    for (const offer of allOffers) {
      try {
        const offerId = offer.id;
        const offerName = offer.name || "";
        const offerPrice = parseFloat(offer.sellingMode?.price?.amount || "0");
        const offerStock = offer.stock?.available || 0;
        const isActive = offer.publication?.status === "ACTIVE";

        // Check if already linked
        const alreadyLinked = await prisma.product.findFirst({
          where: {
            marketplaces: {
              path: ["allegro", "productId"],
              equals: offerId,
            },
          },
        });

        if (alreadyLinked) {
          const mp = alreadyLinked.marketplaces as any;
          await prisma.product.update({
            where: { id: alreadyLinked.id },
            data: {
              stock: offerStock,
              marketplaces: {
                ...mp,
                allegro: {
                  ...mp.allegro,
                  active: isActive,
                  price: offerPrice,
                  url: `https://allegro.pl/oferta/${offerId}`,
                  lastSyncAt: new Date().toISOString(),
                },
              },
            },
          });
          result.matched++;
          continue;
        }

        // Try to match by name
        const matchByName = await prisma.product.findFirst({
          where: {
            name: { equals: offerName, mode: "insensitive" },
          },
        });

        if (matchByName) {
          const mp = matchByName.marketplaces as any;
          await prisma.product.update({
            where: { id: matchByName.id },
            data: {
              marketplaces: {
                ...mp,
                allegro: {
                  active: isActive,
                  productId: offerId,
                  price: offerPrice,
                  url: `https://allegro.pl/oferta/${offerId}`,
                  lastSyncAt: new Date().toISOString(),
                },
              },
            },
          });
          result.matched++;
          log(`🔗 Matched: "${offerName}" → ${matchByName.id}`);
          continue;
        }

        result.skipped++;
        log(`⏭️ No match for Allegro offer: "${offerName}" — skipping`);
      } catch (err: any) {
        result.errors.push(`Offer ${offer.id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    result.errors.push(err.message);
    console.error("❌ Allegro import failed:", err.message);
  }

  log(
    `📊 Import result: ${result.matched} matched, ${result.skipped} skipped, ${result.errors.length} errors`,
  );
  return result;
}

// ============================================
// FULL RECONCILIATION (Allegro → Shop, manual only)
// ============================================

export async function fullReconciliation(): Promise<SyncResult> {
  const result: SyncResult = { success: true, synced: 0, errors: [] };

  const connected = await isAllegroConnected();
  if (!connected) {
    return { success: false, synced: 0, errors: ["Not connected"] };
  }

  try {
    const linkedProducts = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        stock: number;
        price: string;
        allegro_id: string;
      }>
    >`
      SELECT id, name, stock, price::text,
        marketplaces->'allegro'->>'productId' as allegro_id
      FROM products
      WHERE marketplaces->'allegro'->>'productId' IS NOT NULL
    `;

    log(`🔄 Reconciling ${linkedProducts.length} linked products`);

    for (const product of linkedProducts) {
      try {
        const offer = await getOffer(product.allegro_id);
        const allegroStock = offer.stock?.available ?? 0;

        let changed = false;

        if (allegroStock !== product.stock) {
          log(
            `🔄 Stock mismatch "${product.name}": shop=${product.stock}, allegro=${allegroStock}`,
          );
          await prisma.product.update({
            where: { id: product.id },
            data: { stock: allegroStock },
          });
          changed = true;
        }

        if (changed) {
          const fullProduct = await prisma.product.findUnique({
            where: { id: product.id },
            select: { marketplaces: true },
          });
          const mp = fullProduct?.marketplaces as any;
          if (mp?.allegro) {
            await prisma.product.update({
              where: { id: product.id },
              data: {
                marketplaces: {
                  ...mp,
                  allegro: {
                    ...mp.allegro,
                    active: allegroStock > 0,
                    lastSyncAt: new Date().toISOString(),
                  },
                },
              },
            });
          }
          result.synced++;
        }

        await new Promise((r) => setTimeout(r, 200));
      } catch (err: any) {
        if (err.message?.includes("404")) {
          console.warn(
            `⚠️ Allegro offer ${product.allegro_id} returns 404 for "${product.name}" — unlinking`,
          );
          await unlinkAllegroFromProduct(
            product.id,
            `Offer ${product.allegro_id} no longer exists on Allegro (404)`,
          );
          result.synced++;
        } else {
          result.errors.push(`${product.name}: ${err.message}`);
        }
      }
    }
  } catch (err: any) {
    result.success = false;
    result.errors.push(err.message);
  }

  log(
    `🔄 Reconciliation done: ${result.synced} synced, ${result.errors.length} errors`,
  );
  return result;
}

async function unlinkAllegroFromProduct(
  productId: string,
  reason: string,
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, marketplaces: true },
  });
  if (!product) return;

  const mp = product.marketplaces as any;
  const allegroId = mp?.allegro?.productId;
  const { allegro: _removed, ...restMp } = mp || {};

  await prisma.product.update({
    where: { id: productId },
    data: { marketplaces: restMp },
  });

  log(
    `🔗❌ Unlinked Allegro offer ${allegroId} from "${product.name}" — reason: ${reason}`,
  );
}

// ============================================
//    Detect orphaned links (bulk comparison)
// ============================================

export async function detectOrphanedLinks(): Promise<{
  checked: number;
  unlinked: number;
  errors: string[];
}> {
  const result = { checked: 0, unlinked: 0, errors: [] as string[] };

  const connected = await isAllegroConnected();
  if (!connected) {
    result.errors.push("Allegro not connected");
    return result;
  }

  try {
    const allegroOfferIds = new Set<string>();
    let offset = 0;
    const limit = 1000;

    while (true) {
      const data = await getSellerOffers(offset, limit);
      for (const offer of data.offers || []) {
        allegroOfferIds.add(offer.id);
      }
      if (offset + limit >= data.totalCount) break;
      offset += limit;
      await new Promise((r) => setTimeout(r, 200));
    }

    log(`🔍 Allegro has ${allegroOfferIds.size} total offers for this seller`);

    const linkedProducts = await prisma.$queryRaw<
      Array<{ id: string; name: string; allegro_id: string }>
    >`
      SELECT id, name,
        marketplaces->'allegro'->>'productId' as allegro_id
      FROM products
      WHERE marketplaces->'allegro'->>'productId' IS NOT NULL
    `;

    result.checked = linkedProducts.length;
    log(`🔍 Shop has ${linkedProducts.length} products linked to Allegro`);

    for (const product of linkedProducts) {
      if (!allegroOfferIds.has(product.allegro_id)) {
        console.warn(
          `🔗❌ Orphaned link: "${product.name}" → Allegro ${product.allegro_id} (not found in seller offers)`,
        );
        try {
          await unlinkAllegroFromProduct(
            product.id,
            `Offer ${product.allegro_id} not found in seller's Allegro offers`,
          );
          result.unlinked++;
        } catch (err: any) {
          result.errors.push(`Unlink ${product.name}: ${err.message}`);
        }
      }
    }

    log(
      `🔍 Orphan detection done: ${result.checked} checked, ${result.unlinked} unlinked`,
    );
  } catch (err: any) {
    result.errors.push(err.message);
    console.error("❌ Orphan detection failed:", err.message);
  }

  return result;
}
