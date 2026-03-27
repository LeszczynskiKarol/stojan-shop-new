// backend/src/routes/admin-shipping.ts
// Admin CRUD for shipping rate tiers — stored in Setting table (key: "shipping_rates")

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";

// ============================================
// TYPES
// ============================================
export interface ShippingRateRow {
  minWeight: number;
  maxWeight: number;
  prepaidCost: number;
  codCost: number | null;
}

// ============================================
// DB HELPERS
// ============================================

/** Read shipping rates from DB. Returns null if not set (use defaults). */
export async function getShippingRatesFromDb(): Promise<
  ShippingRateRow[] | null
> {
  const row = await prisma.setting.findUnique({
    where: { key: "shipping_rates" },
  });
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return null;
    return parsed as ShippingRateRow[];
  } catch {
    return null;
  }
}

/** Persist shipping rates to DB. */
async function saveShippingRatesToDb(rates: ShippingRateRow[]): Promise<void> {
  await prisma.setting.upsert({
    where: { key: "shipping_rates" },
    update: { value: JSON.stringify(rates) },
    create: { key: "shipping_rates", value: JSON.stringify(rates) },
  });
}

// ============================================
// VALIDATION
// ============================================
function validateRates(
  rates: unknown,
): { ok: true; data: ShippingRateRow[] } | { ok: false; error: string } {
  if (!Array.isArray(rates) || rates.length === 0) {
    return { ok: false, error: "Tablica stawek nie może być pusta" };
  }

  const cleaned: ShippingRateRow[] = [];

  for (let i = 0; i < rates.length; i++) {
    const r = rates[i];
    const minW = Number(r.minWeight);
    const maxW = Number(r.maxWeight);
    const prepaid = Number(r.prepaidCost);
    const cod =
      r.codCost === null || r.codCost === "" || r.codCost === undefined
        ? null
        : Number(r.codCost);

    if (isNaN(minW) || isNaN(maxW) || isNaN(prepaid)) {
      return {
        ok: false,
        error: `Wiersz ${i + 1}: nieprawidłowe wartości liczbowe`,
      };
    }
    if (minW < 0 || maxW < 0 || prepaid < 0) {
      return {
        ok: false,
        error: `Wiersz ${i + 1}: wartości nie mogą być ujemne`,
      };
    }
    if (minW > maxW) {
      return {
        ok: false,
        error: `Wiersz ${i + 1}: min waga (${minW}) > max waga (${maxW})`,
      };
    }
    if (cod !== null && (isNaN(cod) || cod < 0)) {
      return {
        ok: false,
        error: `Wiersz ${i + 1}: nieprawidłowy koszt pobrania`,
      };
    }

    cleaned.push({
      minWeight: parseFloat(minW.toFixed(1)),
      maxWeight: parseFloat(maxW.toFixed(1)),
      prepaidCost: parseFloat(prepaid.toFixed(2)),
      codCost: cod !== null ? parseFloat(cod.toFixed(2)) : null,
    });
  }

  // Check for overlapping ranges
  const sorted = [...cleaned].sort((a, b) => a.minWeight - b.minWeight);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minWeight <= sorted[i - 1].maxWeight) {
      return {
        ok: false,
        error: `Zakresy wagowe nachodzą na siebie: [${sorted[i - 1].minWeight}–${sorted[i - 1].maxWeight}] i [${sorted[i].minWeight}–${sorted[i].maxWeight}]`,
      };
    }
  }

  return { ok: true, data: sorted };
}

// ============================================
// ROUTES
// ============================================
export async function adminShippingRoutes(app: FastifyInstance) {
  // GET /api/admin/shipping — current rates
  app.get("/", async (_request: FastifyRequest, _reply: FastifyReply) => {
    const { SHIPPING_RATES: defaults } =
      await import("../config/shipping.config.js");
    const dbRates = await getShippingRatesFromDb();
    return {
      success: true,
      data: {
        rates: dbRates ?? defaults,
        isCustom: dbRates !== null,
      },
    };
  });

  // PUT /api/admin/shipping — save rates
  app.put<{ Body: { rates: ShippingRateRow[] } }>(
    "/",
    async (
      request: FastifyRequest<{ Body: { rates: ShippingRateRow[] } }>,
      reply: FastifyReply,
    ) => {
      const result = validateRates(request.body?.rates);
      if (!result.ok) {
        return reply.status(400).send({ success: false, error: result.error });
      }

      await saveShippingRatesToDb(result.data);
      return { success: true, data: { rates: result.data } };
    },
  );

  // POST /api/admin/shipping/reset — reset to hardcoded defaults
  app.post("/reset", async (_request: FastifyRequest, _reply: FastifyReply) => {
    await prisma.setting.deleteMany({ where: { key: "shipping_rates" } });
    const { SHIPPING_RATES: defaults } =
      await import("../config/shipping.config.js");
    return { success: true, data: { rates: defaults } };
  });
}
