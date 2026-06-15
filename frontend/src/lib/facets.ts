// frontend/src/lib/facets.ts
// Współdzielona logika facetów (filtry boczne kategorii). Używana JEDNOCZEŚNIE w:
//  • SSR (Astro [categorySlug]/index.astro) — liczy facety z lekkiego pełnego zbioru,
//  • wyspie (CategoryProducts.tsx) — po leniwym doładowaniu pełnego zbioru.
// Jedno źródło prawdy => zero driftu liczników między serwerem a klientem.

export const RPM_RANGES: Record<number, [number, number]> = {
  700: [400, 800],
  900: [800, 1200],
  1400: [1200, 2100],
  2900: [2500, 3500],
};
export const PREDEFINED_RPM_VALUES = [700, 900, 1400, 2900] as const;

const POWER_SLUG_RE = /^silniki?-elektryczn[ey]-?\d/;

/** Parse mocy "7,5" / "7.5" → number */
export function parsePower(v: string | undefined | null): number {
  if (!v || v === "0") return 0;
  return parseFloat(String(v).replace(",", ".")) || 0;
}

/** Czy rpm produktu mieści się w predefiniowanym zakresie obrotów */
export function productMatchesRpmRange(p: any, rpmKey: number): boolean {
  const range = RPM_RANGES[rpmKey];
  if (!range) return false;
  const val = parseFloat(String(p?.rpm?.value || "0").replace(",", "."));
  return val >= range[0] && val <= range[1];
}

export interface Facets {
  categories: { slug: string; name: string; count: number }[];
  manufacturers: [string, number][];
  conditions: [string, number][];
  powers: [string, number][];
  rpms: [string, number][];
  availableRpmRanges: number[];
  rpmRangeCounts: Record<number, number>;
  minPrice: number;
  maxPrice: number;
  minKw: number;
  maxKw: number;
  minRpm: number;
  maxRpm: number;
}

/** Buduje facety z listy produktów (filtruje in-stock wewnątrz). Pure function. */
export function computeFacets(products: any[]): Facets {
  const available = (products || []).filter((p) => p && p.stock > 0);
  const cat = new Map<string, { name: string; count: number }>();
  const mfr = new Map<string, number>();
  const cond = new Map<string, number>();
  const pw = new Map<string, number>();
  const rp = new Map<string, number>();
  let minP = Infinity,
    maxP = 0,
    minKw = Infinity,
    maxKw = 0,
    minRpm = Infinity,
    maxRpm = 0;

  available.forEach((p) => {
    if (p.categories) {
      for (const c of p.categories) {
        const slug = c?.slug;
        const name = c?.name;
        if (slug && name && !POWER_SLUG_RE.test(slug)) {
          const e = cat.get(slug);
          if (e) e.count++;
          else cat.set(slug, { name, count: 1 });
        }
      }
    }
    if (p.manufacturer) mfr.set(p.manufacturer, (mfr.get(p.manufacturer) || 0) + 1);
    cond.set(p.condition, (cond.get(p.condition) || 0) + 1);
    const pv = p.power?.value;
    if (pv && pv !== "0") {
      const n = parsePower(pv);
      if (n > 0) {
        const k = String(n);
        pw.set(k, (pw.get(k) || 0) + 1);
        if (n < minKw) minKw = n;
        if (n > maxKw) maxKw = n;
      }
    }
    const rv = p.rpm?.value;
    if (rv && rv !== "0") {
      const n = parseFloat(String(rv).replace(",", "."));
      if (n > 0) {
        const k = String(n);
        rp.set(k, (rp.get(k) || 0) + 1);
        if (n < minRpm) minRpm = n;
        if (n > maxRpm) maxRpm = n;
      }
    }
    if (p.price < minP) minP = p.price;
    if (p.price > maxP) maxP = p.price;
  });

  const availableRpmRanges = PREDEFINED_RPM_VALUES.filter((rk) =>
    available.some((p) => productMatchesRpmRange(p, rk)),
  );
  const rpmRangeCounts: Record<number, number> = {};
  for (const rk of PREDEFINED_RPM_VALUES) {
    rpmRangeCounts[rk] = available.filter((p) => productMatchesRpmRange(p, rk)).length;
  }

  return {
    categories: [...cat.entries()]
      .map(([slug, { name, count }]) => ({ slug, name, count }))
      .sort((a, b) => b.count - a.count),
    manufacturers: [...mfr.entries()].sort((a, b) => {
      if (a[0].toLowerCase() === "silnik") return 1;
      if (b[0].toLowerCase() === "silnik") return -1;
      return b[1] - a[1];
    }),
    conditions: [...cond.entries()],
    powers: [...pw.entries()].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])),
    rpms: [...rp.entries()].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])),
    availableRpmRanges,
    rpmRangeCounts,
    minPrice: minP === Infinity ? 0 : Math.floor(minP),
    maxPrice: Math.ceil(maxP),
    minKw: minKw === Infinity ? 0 : Math.floor(minKw * 10) / 10,
    maxKw: maxKw === 0 ? 300 : Math.ceil(maxKw),
    minRpm: minRpm === Infinity ? 0 : Math.floor(minRpm / 10) * 10,
    maxRpm: maxRpm === 0 ? 3000 : Math.ceil(maxRpm / 10) * 10,
  };
}
