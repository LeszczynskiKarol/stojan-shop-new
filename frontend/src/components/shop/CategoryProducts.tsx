// frontend/src/components/shop/CategoryProducts.tsx
// Filters synced to URL search params for persistence
// Stores full URL in sessionStorage before navigation so product page can link back

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  SlidersHorizontal,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  ChevronLeft,
  ChevronRight,
  Check,
} from "lucide-react";

const PER_PAGE = 30;

// ============================================
// RPM RANGE DEFINITIONS (from old shop)
// ============================================
const RPM_RANGES: Record<number, [number, number]> = {
  700: [400, 800],
  900: [800, 1200],
  1400: [1200, 2100],
  2900: [2500, 3500],
};
const PREDEFINED_RPM_VALUES = [700, 900, 1400, 2900] as const;

/** Check if a product's rpm.value falls within a predefined RPM range */
function productMatchesRpmRange(p: Product, rpmKey: number): boolean {
  const range = RPM_RANGES[rpmKey];
  if (!range) return false;
  const val = parseFloat(String(p.rpm?.value || "0").replace(",", "."));
  return val >= range[0] && val <= range[1];
}

/** Parse power value string to number (handles both "7,5" and "7.5") */
function parsePower(v: string | undefined | null): number {
  if (!v || v === "0") return 0;
  return parseFloat(String(v).replace(",", ".")) || 0;
}

interface Product {
  id: string;
  name: string;
  manufacturer: string;
  price: number;
  power: { value: string; range?: string };
  rpm: { value: string; range?: string };
  condition: string;
  stock: number;
  mainImage: string | null;
  images: string[];
  shaftDiameter: number;
  mechanicalSize: number;
  weight: number | null;
  marketplaces?: any;
  categories?: any[];
  customParameters?: { name: string; value: string }[];
  technicalDetails?: string;
}

interface Filters {
  search: string;
  categories: string[];
  manufacturers: string[];
  conditions: string[];
  powers: string[];
  rpms: string[];
  rpmRanges: number[];
  powerMin: string;
  powerMax: string;
  rpmSliderMin: string;
  rpmSliderMax: string;
  priceMin: string;
  priceMax: string;
}

const EMPTY: Filters = {
  search: "",
  categories: [],
  manufacturers: [],
  conditions: [],
  powers: [],
  rpms: [],
  rpmRanges: [],
  powerMin: "",
  powerMax: "",
  rpmSliderMin: "",
  rpmSliderMax: "",
  priceMin: "",
  priceMax: "",
};

const COND_LABEL: Record<string, string> = {
  nowy: "Nowy",
  uzywany: "Używany",
  nieuzywany: "Nieużywany",
};
const COND_TOOLTIP: Record<string, string> = {
  nowy: "Produkt fabrycznie nowy, prosto od producenta. Nigdy nie użytkowany, w oryginalnym opakowaniu, objęty 24-miesięczną gwarancją.",
  uzywany:
    "Produkt po profesjonalnym remoncie, kompleksowo sprawdzony i przetestowany. Gotowy do natychmiastowego użycia, objęty 1-miesięczną gwarancją rozruchową.",
  nieuzywany:
    "Produkt fabrycznie nowy, który nie był używany, ale był przechowywany w magazynie. Może nosić minimalne ślady składowania, zachowuje pełną sprawność techniczną i 12-miesięczną gwarancję.",
};
const COND_STYLE: Record<string, { bg: string; text: string; border: string }> =
  {
    nowy: {
      bg: "rgba(34,197,94,0.12)",
      text: "#22c55e",
      border: "rgba(34,197,94,0.25)",
    },
    uzywany: {
      bg: "rgba(245,158,11,0.12)",
      text: "#f59e0b",
      border: "rgba(245,158,11,0.25)",
    },
    nieuzywany: {
      bg: "rgba(59,130,246,0.12)",
      text: "#3b82f6",
      border: "rgba(59,130,246,0.25)",
    },
  };

// ============================================
// URL <-> FILTERS SYNC
// ============================================
function filtersToParams(
  f: Filters,
  page: number,
  sort: string,
): URLSearchParams {
  const p = new URLSearchParams();
  if (f.search) p.set("q", f.search);
  if (f.categories.length) p.set("cat", f.categories.join(","));
  if (f.manufacturers.length) p.set("mfr", f.manufacturers.join(","));
  if (f.conditions.length) p.set("cond", f.conditions.join(","));
  if (f.powers.length) p.set("kw", f.powers.join(","));
  if (f.rpms.length) p.set("rpm", f.rpms.join(","));
  if (f.rpmRanges.length) p.set("rpmr", f.rpmRanges.join(","));
  if (f.powerMin) p.set("kwmin", f.powerMin);
  if (f.powerMax) p.set("kwmax", f.powerMax);
  if (f.rpmSliderMin) p.set("obrmin", f.rpmSliderMin);
  if (f.rpmSliderMax) p.set("obrmax", f.rpmSliderMax);
  if (f.priceMin) p.set("pmin", f.priceMin);
  if (f.priceMax) p.set("pmax", f.priceMax);
  if (page > 1) p.set("page", String(page));
  if (sort !== "price-asc") p.set("sort", sort);
  return p;
}

function paramsToFilters(url: URL): {
  filters: Filters;
  page: number;
  sort: string;
} {
  const p = url.searchParams;
  return {
    filters: {
      search: p.get("q") || "",
      categories: p.get("cat")?.split(",").filter(Boolean) || [],
      manufacturers: p.get("mfr")?.split(",").filter(Boolean) || [],
      conditions: p.get("cond")?.split(",").filter(Boolean) || [],
      powers: p.get("kw")?.split(",").filter(Boolean) || [],
      rpms: p.get("rpm")?.split(",").filter(Boolean) || [],
      rpmRanges:
        p
          .get("rpmr")
          ?.split(",")
          .filter(Boolean)
          .map(Number)
          .filter((n) => !isNaN(n)) || [],
      powerMin: p.get("kwmin") || "",
      powerMax: p.get("kwmax") || "",
      rpmSliderMin: p.get("obrmin") || "",
      rpmSliderMax: p.get("obrmax") || "",
      priceMin: p.get("pmin") || "",
      priceMax: p.get("pmax") || "",
    },
    page: Math.max(1, parseInt(p.get("page") || "1")),
    sort: p.get("sort") || "price-asc",
  };
}

// ============================================
// DUAL RANGE SLIDER (pure CSS, no Radix needed)
// ============================================
function DualRangeSlider({
  min,
  max,
  step,
  valueMin,
  valueMax,
  onChange,
  formatLabel,
  unit,
}: {
  min: number;
  max: number;
  step: number;
  valueMin: number;
  valueMax: number;
  onChange: (lo: number, hi: number) => void;
  formatLabel?: (v: number) => string;
  unit?: string;
}) {
  const fmt = formatLabel || ((v: number) => v.toString().replace(".", ","));
  const pctLo = ((valueMin - min) / (max - min)) * 100;
  const pctHi = ((valueMax - min) / (max - min)) * 100;

  return (
    <div className="cp-slider-wrap">
      <div className="cp-slider-track">
        <div
          className="cp-slider-range"
          style={{ left: `${pctLo}%`, width: `${pctHi - pctLo}%` }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={valueMin}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (v <= valueMax) onChange(v, valueMax);
        }}
        className="cp-slider-input cp-slider-lo"
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={valueMax}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (v >= valueMin) onChange(valueMin, v);
        }}
        className="cp-slider-input cp-slider-hi"
      />
      <div className="cp-slider-labels">
        <span>
          {fmt(valueMin)}
          {unit ? ` ${unit}` : ""}
        </span>
        <span>
          {fmt(valueMax)}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function CategoryProducts({
  products,
  categoryName,
  showCategoryFilter = false,
}: {
  products: Product[];
  categoryName: string;
  showCategoryFilter?: boolean;
}) {
  const initial = useMemo(() => {
    if (typeof window === "undefined")
      return { filters: EMPTY, page: 1, sort: "price-asc" };
    return paramsToFilters(new URL(window.location.href));
  }, []);

  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [sortBy, setSortBy] = useState(initial.sort);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [page, setPage] = useState(initial.page);
  const isInitialMount = useRef(true);

  // Sync state -> URL
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const params = filtersToParams(filters, page, sortBy);
    const qs = params.toString();
    const newUrl = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [filters, page, sortBy]);

  useEffect(() => {
    try {
      sessionStorage.setItem("cp_back_url", window.location.href);
      sessionStorage.setItem("cp_back_label", categoryName);
    } catch {}
  }, [filters, page, sortBy, categoryName]);

  // Only in-stock
  const available = useMemo(
    () => products.filter((p) => p.stock > 0),
    [products],
  );

  const POWER_SLUG_RE = /^silniki?-elektryczn[ey]-?\d/;

  const opts = useMemo(() => {
    const cat = new Map<string, { name: string; count: number }>();
    const mfr = new Map<string, number>();
    const cond = new Map<string, number>();
    const pw = new Map<string, number>();
    const rp = new Map<string, number>();
    let minP = Infinity,
      maxP = 0;
    let minKw = Infinity,
      maxKw = 0;
    let minRpm = Infinity,
      maxRpm = 0;
    available.forEach((p) => {
      if (p.categories) {
        for (const c of p.categories) {
          const slug = (c as any).slug;
          const name = (c as any).name;
          if (slug && name && !POWER_SLUG_RE.test(slug)) {
            const existing = cat.get(slug);
            if (existing) existing.count++;
            else cat.set(slug, { name, count: 1 });
          }
        }
      }
      if (p.manufacturer)
        mfr.set(p.manufacturer, (mfr.get(p.manufacturer) || 0) + 1);
      cond.set(p.condition, (cond.get(p.condition) || 0) + 1);
      const pv = p.power?.value;
      if (pv && pv !== "0") {
        pw.set(pv, (pw.get(pv) || 0) + 1);
        const numPw = parsePower(pv);
        if (numPw > 0) {
          if (numPw < minKw) minKw = numPw;
          if (numPw > maxKw) maxKw = numPw;
        }
      }
      const rv = p.rpm?.value;
      if (rv && rv !== "0") {
        rp.set(rv, (rp.get(rv) || 0) + 1);
        const numRpm = parseFloat(String(rv).replace(",", "."));
        if (numRpm > 0) {
          if (numRpm < minRpm) minRpm = numRpm;
          if (numRpm > maxRpm) maxRpm = numRpm;
        }
      }
      if (p.price < minP) minP = p.price;
      if (p.price > maxP) maxP = p.price;
    });

    const availableRpmRanges = PREDEFINED_RPM_VALUES.filter((rpmKey) =>
      available.some((p) => productMatchesRpmRange(p, rpmKey)),
    );

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
      powers: [...pw.entries()].sort(
        (a, b) =>
          parseFloat(a[0].replace(",", ".")) -
          parseFloat(b[0].replace(",", ".")),
      ),
      rpms: [...rp.entries()].sort(
        (a, b) => parseFloat(a[0]) - parseFloat(b[0]),
      ),
      availableRpmRanges,
      minPrice: minP === Infinity ? 0 : Math.floor(minP),
      maxPrice: Math.ceil(maxP),
      // Round to clean numbers for slider bounds
      minKw: minKw === Infinity ? 0 : Math.floor(minKw * 10) / 10,
      maxKw: maxKw === 0 ? 300 : Math.ceil(maxKw),
      minRpm: minRpm === Infinity ? 0 : Math.floor(minRpm / 10) * 10,
      maxRpm: maxRpm === 0 ? 3000 : Math.ceil(maxRpm / 10) * 10,
    };
  }, [available]);

  // RPM range product counts
  const rpmRangeCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const rpmKey of PREDEFINED_RPM_VALUES) {
      counts[rpmKey] = available.filter((p) =>
        productMatchesRpmRange(p, rpmKey),
      ).length;
    }
    return counts;
  }, [available]);

  // Power slider state (local, committed on release)
  const [powerSlider, setPowerSlider] = useState<[number, number]>([
    filters.powerMin ? parseFloat(filters.powerMin) : opts.minKw,
    filters.powerMax ? parseFloat(filters.powerMax) : opts.maxKw,
  ]);
  // Sync slider when opts change (first load) or when filters are cleared
  useEffect(() => {
    setPowerSlider([
      filters.powerMin ? parseFloat(filters.powerMin) : opts.minKw,
      filters.powerMax ? parseFloat(filters.powerMax) : opts.maxKw,
    ]);
  }, [opts.minKw, opts.maxKw, filters.powerMin, filters.powerMax]);

  // Power input fields (text, Polish format with comma)
  const [powerInputMin, setPowerInputMin] = useState(
    filters.powerMin ? filters.powerMin.replace(".", ",") : "",
  );
  const [powerInputMax, setPowerInputMax] = useState(
    filters.powerMax ? filters.powerMax.replace(".", ",") : "",
  );
  useEffect(() => {
    setPowerInputMin(
      filters.powerMin ? filters.powerMin.replace(".", ",") : "",
    );
    setPowerInputMax(
      filters.powerMax ? filters.powerMax.replace(".", ",") : "",
    );
  }, [filters.powerMin, filters.powerMax]);

  // Commit power range from slider
  const commitPowerSlider = useCallback(
    (lo: number, hi: number) => {
      // If slider covers full range, clear the filter
      const isFullRange =
        Math.abs(lo - opts.minKw) < 0.01 && Math.abs(hi - opts.maxKw) < 0.01;
      setFilters((prev) => ({
        ...prev,
        powerMin: isFullRange ? "" : lo.toString(),
        powerMax: isFullRange ? "" : hi.toString(),
        powers: [], // clear checkbox powers when using slider
      }));
      setPage(1);
    },
    [opts.minKw, opts.maxKw],
  );

  // Commit power from input fields
  const commitPowerInputs = useCallback(() => {
    const lo = parseFloat(powerInputMin.replace(",", "."));
    const hi = parseFloat(powerInputMax.replace(",", "."));
    if (!isNaN(lo) && !isNaN(hi) && lo <= hi) {
      const isFullRange = lo <= opts.minKw && hi >= opts.maxKw;
      setFilters((prev) => ({
        ...prev,
        powerMin: isFullRange ? "" : lo.toString(),
        powerMax: isFullRange ? "" : hi.toString(),
        powers: [],
      }));
      setPowerSlider([Math.max(opts.minKw, lo), Math.min(opts.maxKw, hi)]);
      setPage(1);
    }
  }, [powerInputMin, powerInputMax, opts.minKw, opts.maxKw]);

  // RPM slider state
  const isMotoreduktory = /motoreduktor/i.test(categoryName);
  const [rpmSlider, setRpmSlider] = useState<[number, number]>([
    filters.rpmSliderMin ? parseFloat(filters.rpmSliderMin) : opts.minRpm,
    filters.rpmSliderMax ? parseFloat(filters.rpmSliderMax) : opts.maxRpm,
  ]);
  useEffect(() => {
    setRpmSlider([
      filters.rpmSliderMin ? parseFloat(filters.rpmSliderMin) : opts.minRpm,
      filters.rpmSliderMax ? parseFloat(filters.rpmSliderMax) : opts.maxRpm,
    ]);
  }, [opts.minRpm, opts.maxRpm, filters.rpmSliderMin, filters.rpmSliderMax]);

  const [rpmInputMin, setRpmInputMin] = useState(filters.rpmSliderMin || "");
  const [rpmInputMax, setRpmInputMax] = useState(filters.rpmSliderMax || "");
  useEffect(() => {
    setRpmInputMin(filters.rpmSliderMin || "");
    setRpmInputMax(filters.rpmSliderMax || "");
  }, [filters.rpmSliderMin, filters.rpmSliderMax]);

  const snapRpm = useCallback((v: number): number => {
    return Math.round(v / 10) * 10; // snap to nearest 10
  }, []);

  const commitRpmSlider = useCallback(
    (lo: number, hi: number) => {
      const isFullRange =
        Math.abs(lo - opts.minRpm) < 5 && Math.abs(hi - opts.maxRpm) < 5;
      setFilters((prev) => ({
        ...prev,
        rpmSliderMin: isFullRange ? "" : lo.toString(),
        rpmSliderMax: isFullRange ? "" : hi.toString(),
        rpms: [],
        rpmRanges: [],
      }));
      setPage(1);
    },
    [opts.minRpm, opts.maxRpm],
  );

  const commitRpmInputs = useCallback(() => {
    const lo = parseFloat(rpmInputMin.replace(",", "."));
    const hi = parseFloat(rpmInputMax.replace(",", "."));
    if (!isNaN(lo) && !isNaN(hi) && lo <= hi) {
      const isFullRange = lo <= opts.minRpm && hi >= opts.maxRpm;
      setFilters((prev) => ({
        ...prev,
        rpmSliderMin: isFullRange ? "" : lo.toString(),
        rpmSliderMax: isFullRange ? "" : hi.toString(),
        rpms: [],
        rpmRanges: [],
      }));
      setRpmSlider([Math.max(opts.minRpm, lo), Math.min(opts.maxRpm, hi)]);
      setPage(1);
    }
  }, [rpmInputMin, rpmInputMax, opts.minRpm, opts.maxRpm]);

  // Filtered + sorted
  const filtered = useMemo(() => {
    let r = available;
    if (filters.search.trim()) {
      const t = filters.search.toLowerCase();
      r = r.filter(
        (p) =>
          p.name.toLowerCase().includes(t) ||
          p.manufacturer.toLowerCase().includes(t) ||
          (p.technicalDetails || "").toLowerCase().includes(t) ||
          (p.customParameters || []).some(
            (cp) =>
              cp.name.toLowerCase().includes(t) ||
              cp.value.toLowerCase().includes(t),
          ),
      );
    }

    if (filters.categories.length)
      r = r.filter((p) =>
        (p.categories || []).some((c: any) =>
          filters.categories.includes(c.slug),
        ),
      );
    if (filters.manufacturers.length)
      r = r.filter((p) => filters.manufacturers.includes(p.manufacturer));
    if (filters.conditions.length)
      r = r.filter((p) => filters.conditions.includes(p.condition));

    // Power: range slider OR checkboxes
    const hasPowerRange = filters.powerMin || filters.powerMax;
    const hasPowerChecks = filters.powers.length > 0;
    if (hasPowerRange || hasPowerChecks) {
      r = r.filter((p) => {
        if (hasPowerChecks && filters.powers.includes(p.power?.value))
          return true;
        if (hasPowerRange) {
          const pw = parsePower(p.power?.value);
          if (pw === 0) return false;
          const lo = filters.powerMin ? parseFloat(filters.powerMin) : 0;
          const hi = filters.powerMax ? parseFloat(filters.powerMax) : Infinity;
          return pw >= lo && pw <= hi;
        }
        return false;
      });
    }

    // RPM: slider range OR exact checkboxes OR range buttons (OR logic)
    const hasExactRpm = filters.rpms.length > 0;
    const hasRpmRange = filters.rpmRanges.length > 0;
    const hasRpmSlider = !!(filters.rpmSliderMin || filters.rpmSliderMax);
    if (hasExactRpm || hasRpmRange || hasRpmSlider) {
      r = r.filter((p) => {
        const matchesExact = hasExactRpm && filters.rpms.includes(p.rpm?.value);
        const matchesRange =
          hasRpmRange &&
          filters.rpmRanges.some((rpmKey) => productMatchesRpmRange(p, rpmKey));
        if (hasRpmSlider) {
          const rv = parseFloat(String(p.rpm?.value || "0").replace(",", "."));
          if (rv === 0) return matchesExact || matchesRange;
          const lo = filters.rpmSliderMin
            ? parseFloat(filters.rpmSliderMin)
            : 0;
          const hi = filters.rpmSliderMax
            ? parseFloat(filters.rpmSliderMax)
            : Infinity;
          if (rv >= lo && rv <= hi) return true;
        }
        return matchesExact || matchesRange;
      });
    }

    if (filters.priceMin) {
      const m = parseFloat(filters.priceMin);
      if (!isNaN(m)) r = r.filter((p) => p.price >= m);
    }
    if (filters.priceMax) {
      const m = parseFloat(filters.priceMax);
      if (!isNaN(m)) r = r.filter((p) => p.price <= m);
    }
    switch (sortBy) {
      case "price-asc":
        r = [...r].sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        r = [...r].sort((a, b) => b.price - a.price);
        break;
      case "name-asc":
        r = [...r].sort((a, b) => a.name.localeCompare(b.name, "pl"));
        break;
      case "power-asc":
        r = [...r].sort(
          (a, b) => parsePower(a.power?.value) - parsePower(b.power?.value),
        );
        break;
    }
    return r;
  }, [available, filters, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE),
    [filtered, safePage],
  );

  const update = useCallback((fn: (p: Filters) => Filters) => {
    setFilters(fn);
    setPage(1);
  }, []);
  const toggle = useCallback(
    (key: keyof Filters, val: string) => {
      update((p) => {
        const a = p[key] as string[];
        return {
          ...p,
          [key]: a.includes(val) ? a.filter((v) => v !== val) : [...a, val],
        };
      });
    },
    [update],
  );
  const toggleRpmRange = useCallback(
    (rpmKey: number) => {
      update((p) => ({
        ...p,
        rpmRanges: p.rpmRanges.includes(rpmKey)
          ? p.rpmRanges.filter((v) => v !== rpmKey)
          : [...p.rpmRanges, rpmKey],
        rpms: [],
      }));
    },
    [update],
  );

  const activeCount =
    filters.categories.length +
    filters.manufacturers.length +
    filters.conditions.length +
    filters.powers.length +
    filters.rpms.length +
    filters.rpmRanges.length +
    (filters.powerMin ? 1 : 0) +
    (filters.powerMax ? 1 : 0) +
    (filters.rpmSliderMin ? 1 : 0) +
    (filters.rpmSliderMax ? 1 : 0) +
    (filters.priceMin ? 1 : 0) +
    (filters.priceMax ? 1 : 0) +
    (filters.search ? 1 : 0);
  const clear = () => {
    setFilters(EMPTY);
    setPowerSlider([opts.minKw, opts.maxKw]);
    setRpmSlider([opts.minRpm, opts.maxRpm]);
    setPage(1);
  };

  const productUrl = (p: Product) => {
    const slug = p.marketplaces?.ownStore?.slug;
    const cat = p.categories?.[0]?.slug;
    if (!slug || !cat) return `/produkt/${p.id}`;
    return `/${cat}/${slug}`;
  };

  const goTo = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Power slider step (0.1 like old shop — text inputs for finer control)
  const powerStep = 0.1;

  /** Round power value to clean number based on magnitude */
  const snapPower = useCallback((v: number): number => {
    if (v <= 0.1) return Math.round(v * 1000) / 1000; // 0.045 → 0.045
    if (v < 1) return Math.round(v * 100) / 100; // 0.75 → 0.75
    if (v < 10) return Math.round(v * 10) / 10; // 3.7 → 3.7
    return Math.round(v); // 29 → 29
  }, []);

  return (
    <div className="cp-wrap">
      {/* SIDEBAR */}
      <aside className={`cp-side${mobileOpen ? " open" : ""}`}>
        <div className="cp-side-hd">
          <div className="cp-side-title">
            <SlidersHorizontal size={15} />
            <span>Filtry</span>
            {activeCount > 0 && <span className="cp-badge">{activeCount}</span>}
          </div>
          {activeCount > 0 && (
            <button onClick={clear} className="cp-clr">
              Wyczyść
            </button>
          )}
          <button className="cp-mob-x" onClick={() => setMobileOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="cp-sec">
          <div className="cp-srch-w">
            <Search size={14} className="cp-srch-i" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) =>
                update((p) => ({ ...p, search: e.target.value }))
              }
              placeholder="Szukaj w kategorii..."
              className="cp-srch"
            />
          </div>
        </div>

        {showCategoryFilter && opts.categories.length > 0 && (
          <FG title="Kategoria" col defaultOpen={true}>
            {opts.categories.map((c) => (
              <CBox
                key={c.slug}
                checked={filters.categories.includes(c.slug)}
                onChange={() => toggle("categories", c.slug)}
                label={c.name}
                count={c.count}
              />
            ))}
          </FG>
        )}

        {/* POWER RANGE SLIDER */}
        {opts.maxKw > 0 && opts.powers.length > 1 && (
          <FG title="Przedział mocy (kW)">
            <DualRangeSlider
              min={opts.minKw}
              max={opts.maxKw}
              step={powerStep}
              valueMin={powerSlider[0]}
              valueMax={powerSlider[1]}
              onChange={(lo, hi) => {
                const sLo = snapPower(lo);
                const sHi = snapPower(hi);
                setPowerSlider([sLo, sHi]);
                commitPowerSlider(sLo, sHi);
              }}
              unit="kW"
            />
            <div className="cp-range-inputs">
              <input
                type="text"
                value={powerInputMin}
                onChange={(e) => {
                  // Allow only digits, comma, dot
                  const v = e.target.value
                    .replace(/[^\d,\.]/g, "")
                    .replace(".", ",");
                  setPowerInputMin(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitPowerInputs();
                }}
                placeholder={opts.minKw.toString().replace(".", ",")}
                className="cp-range-in"
              />
              <span className="cp-range-dash">–</span>
              <input
                type="text"
                value={powerInputMax}
                onChange={(e) => {
                  const v = e.target.value
                    .replace(/[^\d,\.]/g, "")
                    .replace(".", ",");
                  setPowerInputMax(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitPowerInputs();
                }}
                placeholder={opts.maxKw.toString().replace(".", ",")}
                className="cp-range-in"
              />
              <button
                onClick={commitPowerInputs}
                className="cp-range-go"
                title="Filtruj"
              >
                OK
              </button>
            </div>
          </FG>
        )}

        {/* Moc — checkboxy (domyślnie zwinięte gdy jest slider) */}
        {opts.powers.length > 1 && (
          <FG title="Moc — dokładne [kW]" col defaultOpen={false}>
            {opts.powers.map(([v, c]) => (
              <CBox
                key={v}
                checked={filters.powers.includes(v)}
                onChange={() => toggle("powers", v)}
                label={`${v.replace(/\s*kW$/i, "")} kW`}
                count={c}
              />
            ))}
          </FG>
        )}

        {opts.conditions.length > 1 && (
          <FG title="Stan">
            {opts.conditions.map(([v, c]) => (
              <CBox
                key={v}
                checked={filters.conditions.includes(v)}
                onChange={() => toggle("conditions", v)}
                label={COND_LABEL[v] || v}
                count={c}
              />
            ))}
          </FG>
        )}

        {/* RPM RANGE SLIDER (hidden for motoreduktory) */}
        {!isMotoreduktory && opts.maxRpm > 0 && opts.rpms.length > 1 && (
          <FG title="Przedział obrotów (obr/min)">
            <DualRangeSlider
              min={opts.minRpm}
              max={opts.maxRpm}
              step={10}
              valueMin={rpmSlider[0]}
              valueMax={rpmSlider[1]}
              onChange={(lo, hi) => {
                const sLo = snapRpm(lo);
                const sHi = snapRpm(hi);
                setRpmSlider([sLo, sHi]);
                commitRpmSlider(sLo, sHi);
              }}
              unit="obr/min"
            />
            <div className="cp-range-inputs">
              <input
                type="text"
                value={rpmInputMin}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d]/g, "");
                  setRpmInputMin(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRpmInputs();
                }}
                placeholder={String(opts.minRpm)}
                className="cp-range-in"
              />
              <span className="cp-range-dash">–</span>
              <input
                type="text"
                value={rpmInputMax}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d]/g, "");
                  setRpmInputMax(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRpmInputs();
                }}
                placeholder={String(opts.maxRpm)}
                className="cp-range-in"
              />
              <button
                onClick={commitRpmInputs}
                className="cp-range-go"
                title="Filtruj"
              >
                OK
              </button>
            </div>
          </FG>
        )}

        {/* RPM RANGE BUTTONS */}
        {!isMotoreduktory && opts.availableRpmRanges.length > 0 && (
          <FG title="Obroty — szybki wybór">
            <div className="cp-rpm-btns">
              {opts.availableRpmRanges.map((rpmKey) => {
                const isActive = filters.rpmRanges.includes(rpmKey);
                return (
                  <button
                    key={rpmKey}
                    onClick={() => toggleRpmRange(rpmKey)}
                    className={`cp-rpm-btn${isActive ? " active" : ""}`}
                  >
                    <span className="cp-rpm-val">{rpmKey}</span>
                    <span className="cp-rpm-unit">obr/min</span>
                    {isActive && <Check size={12} className="cp-rpm-chk" />}
                    <span className="cp-rpm-cnt">{rpmRangeCounts[rpmKey]}</span>
                  </button>
                );
              })}
            </div>
          </FG>
        )}

        {opts.manufacturers.length > 1 && (
          <FG
            title="Producent"
            col
            defaultOpen={opts.manufacturers.length <= 8}
          >
            {opts.manufacturers.map(([v, c]) => (
              <CBox
                key={v}
                checked={filters.manufacturers.includes(v)}
                onChange={() => toggle("manufacturers", v)}
                label={
                  v.toLowerCase() === "silnik" ? "Inny / brak producenta" : v
                }
                count={c}
                ellipsis
              />
            ))}
          </FG>
        )}

        {opts.rpms.length > 1 && (
          <FG title="Obroty — dokładne [obr/min]" col defaultOpen={false}>
            {opts.rpms.map(([v, c]) => (
              <CBox
                key={v}
                checked={filters.rpms.includes(v)}
                onChange={() => toggle("rpms", v)}
                label={`${v} obr/min`}
                count={c}
              />
            ))}
          </FG>
        )}

        <FG title="Cena [PLN]">
          <div className="cp-price">
            <input
              type="number"
              value={filters.priceMin}
              onChange={(e) =>
                update((p) => ({ ...p, priceMin: e.target.value }))
              }
              placeholder={`od ${opts.minPrice}`}
              className="cp-pin"
              min={0}
            />
            <span className="cp-pdash">–</span>
            <input
              type="number"
              value={filters.priceMax}
              onChange={(e) =>
                update((p) => ({ ...p, priceMax: e.target.value }))
              }
              placeholder={`do ${opts.maxPrice}`}
              className="cp-pin"
              min={0}
            />
          </div>
        </FG>
      </aside>

      {/* MAIN */}
      <div className="cp-main">
        <div className="cp-bar">
          <div className="cp-bar-l">
            <button className="cp-mob-btn" onClick={() => setMobileOpen(true)}>
              <SlidersHorizontal size={14} />
              Filtry
              {activeCount > 0 && (
                <span className="cp-badge">{activeCount}</span>
              )}
            </button>
            <span className="cp-cnt">
              {filtered.length}{" "}
              {filtered.length === 1
                ? "produkt"
                : filtered.length < 5
                  ? "produkty"
                  : "produktów"}
            </span>
          </div>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
            className="cp-sort"
          >
            <option value="price-asc">Cena: rosnąco</option>
            <option value="price-desc">Cena: malejąco</option>
            <option value="name-asc">Nazwa A-Z</option>
            <option value="power-asc">Moc: rosnąco</option>
          </select>
        </div>

        {activeCount > 0 && (
          <div className="cp-tags">
            {filters.search && (
              <Tag
                label={`"${filters.search}"`}
                onRemove={() => update((p) => ({ ...p, search: "" }))}
              />
            )}
            {filters.categories.map((slug) => {
              const catOpt = opts.categories.find((c) => c.slug === slug);
              return (
                <Tag
                  key={slug}
                  label={catOpt?.name || slug}
                  onRemove={() => toggle("categories", slug)}
                />
              );
            })}
            {filters.conditions.map((c) => (
              <Tag
                key={c}
                label={COND_LABEL[c] || c}
                onRemove={() => toggle("conditions", c)}
              />
            ))}
            {filters.manufacturers.map((m) => (
              <Tag
                key={m}
                label={
                  m.toLowerCase() === "silnik" ? "Inny / brak producenta" : m
                }
                onRemove={() => toggle("manufacturers", m)}
              />
            ))}
            {(filters.powerMin || filters.powerMax) && (
              <Tag
                label={`${(filters.powerMin || String(opts.minKw)).replace(".", ",")} – ${(filters.powerMax || String(opts.maxKw)).replace(".", ",")} kW`}
                onRemove={() => {
                  update((p) => ({ ...p, powerMin: "", powerMax: "" }));
                  setPowerSlider([opts.minKw, opts.maxKw]);
                }}
              />
            )}
            {(filters.rpmSliderMin || filters.rpmSliderMax) && (
              <Tag
                label={`${filters.rpmSliderMin || opts.minRpm} – ${filters.rpmSliderMax || opts.maxRpm} obr/min`}
                onRemove={() => {
                  update((p) => ({ ...p, rpmSliderMin: "", rpmSliderMax: "" }));
                  setRpmSlider([opts.minRpm, opts.maxRpm]);
                }}
              />
            )}
            {filters.powers.map((v) => (
              <Tag
                key={v}
                label={`${v} kW`}
                onRemove={() => toggle("powers", v)}
              />
            ))}
            {filters.rpmRanges.map((rpmKey) => (
              <Tag
                key={`rr-${rpmKey}`}
                label={`~${rpmKey} obr/min`}
                onRemove={() => toggleRpmRange(rpmKey)}
              />
            ))}
            {filters.rpms.map((v) => (
              <Tag
                key={v}
                label={`${v} obr/min`}
                onRemove={() => toggle("rpms", v)}
              />
            ))}
            {(filters.priceMin || filters.priceMax) && (
              <Tag
                label={`${filters.priceMin || "0"} – ${filters.priceMax || "∞"} PLN`}
                onRemove={() =>
                  update((p) => ({ ...p, priceMin: "", priceMax: "" }))
                }
              />
            )}
            <button onClick={clear} className="cp-clr-all">
              Wyczyść wszystkie
            </button>
          </div>
        )}

        {paginated.length > 0 ? (
          <div className="cp-grid">
            {paginated.map((p) => (
              <Card key={p.id} product={p} url={productUrl(p)} />
            ))}
          </div>
        ) : (
          <div className="cp-empty">
            <p>Brak produktów spełniających kryteria.</p>
            {activeCount > 0 && (
              <button onClick={clear} className="cp-empty-btn">
                Wyczyść filtry
              </button>
            )}
          </div>
        )}

        {totalPages > 1 && (
          <Pager current={safePage} total={totalPages} onChange={goTo} />
        )}
      </div>

      {mobileOpen && (
        <div className="cp-ov" onClick={() => setMobileOpen(false)} />
      )}
      <style>{CSS}</style>
    </div>
  );
}

// ============================================
// PRODUCT CARD
// ============================================
function Card({ product, url }: { product: Product; url: string }) {
  const [tip, setTip] = useState(false);
  const img = product.mainImage || product.images?.[0];
  const pw = product.power?.value;
  const rpm = product.rpm?.value;
  const s = COND_STYLE[product.condition] || COND_STYLE.nowy;

  return (
    <a
      href={url}
      className="cp-card"
      itemScope
      itemType="https://schema.org/Product"
    >
      <meta itemProp="name" content={product.name} />
      <meta itemProp="brand" content={product.manufacturer} />
      <div itemProp="offers" itemScope itemType="https://schema.org/Offer">
        <meta itemProp="priceCurrency" content="PLN" />
        <meta itemProp="price" content={String(product.price)} />
        <meta itemProp="availability" content="https://schema.org/InStock" />
        <meta
          itemProp="itemCondition"
          content={
            product.condition === "nowy"
              ? "https://schema.org/NewCondition"
              : "https://schema.org/UsedCondition"
          }
        />
      </div>
      <div className="cp-card-iw">
        {img ? (
          <img
            src={img}
            alt={product.name}
            className="cp-card-im"
            loading="lazy"
            width={300}
            height={300}
            itemProp="image"
          />
        ) : (
          <div className="cp-card-no">Brak zdjęcia</div>
        )}
        <span
          className="cp-cond"
          style={{ background: s.bg, color: s.text, borderColor: s.border }}
          onMouseEnter={() => setTip(true)}
          onMouseLeave={() => setTip(false)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setTip(!tip);
          }}
        >
          {COND_LABEL[product.condition] || product.condition}
        </span>
        {tip && (
          <div
            className="cp-tip"
            onMouseEnter={() => setTip(true)}
            onMouseLeave={() => setTip(false)}
          >
            <div className="cp-tip-hd" style={{ color: s.text }}>
              {COND_LABEL[product.condition]}
            </div>
            <p className="cp-tip-bd">{COND_TOOLTIP[product.condition]}</p>
          </div>
        )}
      </div>
      <div className="cp-card-inf">
        <p className="cp-card-mfr">{product.manufacturer}</p>
        <h3 className="cp-card-nm">{product.name}</h3>
        <div className="cp-card-sp">
          {pw && pw !== "0" && (
            <span>{pw.replace(/\s*kW/i, "").trim()} kW</span>
          )}
          {rpm && rpm !== "0" && (
            <span>{rpm.replace(/\s*obr.*/i, "").trim()} obr</span>
          )}
        </div>
        <div className="cp-card-bt">
          <span className="cp-card-pr">
            {product.price % 1 === 0
              ? product.price.toLocaleString("pl-PL", {
                  minimumFractionDigits: 0,
                })
              : product.price.toLocaleString("pl-PL", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
            zł
          </span>
          <span className="cp-card-st">{product.stock} szt.</span>
        </div>
      </div>
    </a>
  );
}

// ============================================
// PAGINATION
// ============================================
function Pager({
  current,
  total,
  onChange,
}: {
  current: number;
  total: number;
  onChange: (p: number) => void;
}) {
  const pages: (number | "...")[] = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current > 3) pages.push("...");
    for (
      let i = Math.max(2, current - 1);
      i <= Math.min(total - 1, current + 1);
      i++
    )
      pages.push(i);
    if (current < total - 2) pages.push("...");
    pages.push(total);
  }
  return (
    <nav className="cp-pag" aria-label="Paginacja produktów">
      <button
        disabled={current === 1}
        onClick={() => onChange(current - 1)}
        className="cp-pg"
        aria-label="Poprzednia strona"
      >
        <ChevronLeft size={16} />
      </button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`d${i}`} className="cp-dots">
            ...
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p as number)}
            className={`cp-pg${current === p ? " act" : ""}`}
            aria-label={`Strona ${p}`}
            aria-current={current === p ? "page" : undefined}
          >
            {p}
          </button>
        ),
      )}
      <button
        disabled={current === total}
        onClick={() => onChange(current + 1)}
        className="cp-pg"
        aria-label="Następna strona"
      >
        <ChevronRight size={16} />
      </button>
      <span className="cp-pinfo">
        Strona {current} z {total}
      </span>
    </nav>
  );
}

// ============================================
// HELPERS
// ============================================
function FG({
  title,
  children,
  col,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  col?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="cp-fg">
      <button className="cp-fg-hd" onClick={() => col && setOpen(!open)}>
        <span>{title}</span>
        {col && (open ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
      </button>
      {(!col || open) && <div className="cp-fg-bd">{children}</div>}
    </div>
  );
}

function CBox({
  checked,
  onChange,
  label,
  count,
  ellipsis,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  count: number;
  ellipsis?: boolean;
}) {
  return (
    <label className="cp-ck">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="cp-cb"
      />
      <span className={ellipsis ? "cp-ck-el" : ""}>{label}</span>
      <span className="cp-cc">{count}</span>
    </label>
  );
}

function Tag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button className="cp-tag" onClick={onRemove}>
      {label}
      <X size={12} />
    </button>
  );
}

// ============================================
const CSS = `
.cp-wrap{display:grid;grid-template-columns:260px 1fr;gap:24px;position:relative}
@media(max-width:900px){.cp-wrap{grid-template-columns:1fr}}
.cp-side{position:sticky;top:80px;max-height:calc(100vh - 96px);overflow-y:auto;border:1px solid hsl(var(--border));border-radius:10px;background:hsl(var(--card))}
.cp-side::-webkit-scrollbar{width:4px}.cp-side::-webkit-scrollbar-thumb{background:hsl(var(--border));border-radius:2px}
@media(max-width:900px){.cp-side{position:fixed;top:0;left:-320px;width:300px;height:100vh;max-height:100vh;z-index:200;border-radius:0;border:none;border-right:1px solid hsl(var(--border));transition:left .25s ease}.cp-side.open{left:0}}
.cp-side-hd{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid hsl(var(--border));position:sticky;top:0;background:hsl(var(--card));z-index:5}
.cp-side-title{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:hsl(var(--foreground));flex:1}
.cp-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:hsl(var(--primary));color:hsl(var(--primary-foreground));font-size:10px;font-weight:700}
.cp-clr{font-size:11px;color:hsl(var(--muted-foreground));background:none;border:none;cursor:pointer;text-decoration:underline}.cp-clr:hover{color:hsl(var(--foreground))}
.cp-mob-x{display:none;background:none;border:none;color:hsl(var(--muted-foreground));cursor:pointer;padding:4px}@media(max-width:900px){.cp-mob-x{display:flex}}
.cp-sec{padding:12px 16px;border-bottom:1px solid hsl(var(--border))}
.cp-fg{border-bottom:1px solid hsl(var(--border))}
.cp-fg-hd{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;cursor:pointer;font-size:12px;font-weight:600;color:hsl(var(--muted-foreground));text-transform:uppercase;letter-spacing:.04em;background:none;border:none;width:100%;text-align:left}.cp-fg-hd:hover{color:hsl(var(--foreground))}
.cp-fg-bd{padding:0 16px 12px;display:flex;flex-direction:column;gap:4px;max-height:220px;overflow-y:auto}
.cp-ck{display:flex;align-items:center;gap:8px;font-size:13px;color:hsl(var(--foreground));cursor:pointer;padding:3px 0}
.cp-ck-el{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-cb{width:15px;height:15px;border-radius:3px;accent-color:hsl(var(--primary));cursor:pointer;flex-shrink:0}
.cp-cc{font-size:11px;color:hsl(var(--muted-foreground));margin-left:auto;flex-shrink:0}
.cp-srch-w{position:relative}.cp-srch-i{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:hsl(var(--muted-foreground));pointer-events:none}
.cp-srch{width:100%;padding:7px 10px 7px 30px;font-size:13px;border:1px solid hsl(var(--border));border-radius:6px;background:hsl(var(--background));color:hsl(var(--foreground));outline:none}.cp-srch:focus{border-color:hsl(var(--primary))}.cp-srch::placeholder{color:hsl(var(--muted-foreground))}
.cp-price{display:flex;align-items:center;gap:6px}
.cp-pin{flex:1;min-width:0;padding:6px 8px;font-size:13px;border:1px solid hsl(var(--border));border-radius:6px;background:hsl(var(--background));color:hsl(var(--foreground));outline:none}.cp-pin:focus{border-color:hsl(var(--primary))}.cp-pin::placeholder{color:hsl(var(--muted-foreground))}
.cp-pdash{color:hsl(var(--muted-foreground));flex-shrink:0}
.cp-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:12px}
.cp-bar-l{display:flex;align-items:center;gap:12px}
.cp-cnt{font-size:13px;color:hsl(var(--muted-foreground))}
.cp-sort{padding:7px 12px;font-size:13px;border:1px solid hsl(var(--border));border-radius:6px;background:hsl(var(--card));color:hsl(var(--foreground));outline:none;cursor:pointer}.cp-sort:focus{border-color:hsl(var(--primary))}
.cp-mob-btn{display:none;align-items:center;gap:6px;padding:7px 14px;font-size:13px;font-weight:500;border:1px solid hsl(var(--border));border-radius:6px;background:hsl(var(--card));color:hsl(var(--foreground));cursor:pointer}@media(max-width:900px){.cp-mob-btn{display:inline-flex}}
.cp-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.cp-tag{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:12px;border-radius:20px;background:hsl(var(--primary)/.12);color:hsl(var(--primary));border:none;cursor:pointer}.cp-tag:hover{background:hsl(var(--primary)/.2)}
.cp-clr-all{font-size:12px;color:hsl(var(--muted-foreground));background:none;border:none;cursor:pointer;text-decoration:underline}
.cp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
@media(max-width:600px){.cp-grid{grid-template-columns:repeat(2,1fr);gap:10px}}
.cp-card{display:flex;flex-direction:column;border:1px solid hsl(var(--border));border-radius:10px;background:hsl(var(--card));overflow:hidden;text-decoration:none;color:inherit;transition:border-color .15s,box-shadow .15s}
.cp-card:hover{border-color:hsl(var(--primary)/.4);box-shadow:0 4px 20px hsl(var(--primary)/.08)}
.cp-card-iw{position:relative;aspect-ratio:1;background:hsl(var(--accent));overflow:hidden}
.cp-card-im{width:100%;height:100%;object-fit:contain;transition:transform .2s}.cp-card:hover .cp-card-im{transform:scale(1.04)}
.cp-card-no{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:hsl(var(--muted-foreground));font-size:12px}
.cp-cond{position:absolute;top:8px;left:8px;padding:3px 10px;border-radius:5px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;cursor:help;z-index:2;transition:transform .1s;border:1px solid}.cp-cond:hover{transform:scale(1.05)}
.cp-tip{position:absolute;top:38px;left:8px;right:8px;background:hsl(var(--card));border:1px solid hsl(var(--border));border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.55;color:hsl(var(--foreground));box-shadow:0 8px 24px rgba(0,0,0,.3);z-index:10;pointer-events:auto}
.cp-tip-hd{font-weight:700;font-size:13px;margin-bottom:4px}
.cp-tip-bd{margin:0;color:hsl(var(--muted-foreground))}
.cp-card-inf{padding:12px;display:flex;flex-direction:column;flex:1}
.cp-card-mfr{font-size:11px;color:hsl(var(--muted-foreground));text-transform:capitalize;letter-spacing:.04em;margin:0}
.cp-card-nm{font-size:13px;font-weight:500;color:hsl(var(--card-foreground));margin:4px 0 0;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cp-card-nm::first-letter{text-transform:uppercase}
.cp-card-sp{display:flex;gap:8px;margin-top:8px;font-size:11px;color:hsl(var(--muted-foreground))}.cp-card-sp span{padding:1px 6px;border-radius:3px;background:hsl(var(--accent))}
.cp-card-bt{margin-top:auto;padding-top:10px;display:flex;align-items:baseline;justify-content:space-between}
.cp-card-pr{font-size:16px;font-weight:700;color:hsl(var(--foreground))}
.cp-card-st{font-size:11px;color:#22c55e;font-weight:500}
.cp-empty{padding:60px 20px;text-align:center;color:hsl(var(--muted-foreground))}
.cp-empty-btn{margin-top:12px;padding:8px 20px;border-radius:6px;border:1px solid hsl(var(--border));background:hsl(var(--card));color:hsl(var(--foreground));cursor:pointer;font-size:13px}
.cp-pag{display:flex;align-items:center;justify-content:center;gap:4px;margin-top:28px;padding-top:20px;border-top:1px solid hsl(var(--border));flex-wrap:wrap}
.cp-pg{display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:36px;padding:0 8px;border:1px solid hsl(var(--border));border-radius:6px;background:hsl(var(--card));color:hsl(var(--foreground));font-size:13px;font-weight:500;cursor:pointer;transition:all .15s}
.cp-pg:hover:not(:disabled):not(.act){border-color:hsl(var(--primary)/.5);color:hsl(var(--primary))}
.cp-pg.act{background:hsl(var(--primary));color:hsl(var(--primary-foreground));border-color:hsl(var(--primary))}
.cp-pg:disabled{opacity:.4;cursor:not-allowed}
.cp-dots{padding:0 4px;color:hsl(var(--muted-foreground));font-size:14px}
.cp-pinfo{font-size:12px;color:hsl(var(--muted-foreground));margin-left:12px}
.cp-ov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:199}@media(max-width:900px){.cp-ov{display:block}}
.cp-rpm-btns{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.cp-rpm-btn{display:flex;align-items:center;justify-content:center;gap:3px;padding:7px 6px;border-radius:8px;border:1px solid hsl(var(--border));background:hsl(var(--card));color:hsl(var(--foreground));font-size:12px;cursor:pointer;transition:all .15s;position:relative}
.cp-rpm-btn:hover{border-color:hsl(var(--primary)/.5);background:hsl(var(--primary)/.04)}
.cp-rpm-btn.active{border-color:hsl(var(--primary));background:hsl(var(--primary)/.1);color:hsl(var(--primary));font-weight:600}
.cp-rpm-val{font-weight:600;font-size:13px}
.cp-rpm-unit{font-size:10px;opacity:.7}
.cp-rpm-chk{flex-shrink:0;color:hsl(var(--primary))}
.cp-rpm-cnt{position:absolute;top:-5px;right:-3px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:hsl(var(--muted-foreground)/.15);color:hsl(var(--muted-foreground));font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center}
.cp-rpm-btn.active .cp-rpm-cnt{background:hsl(var(--primary)/.2);color:hsl(var(--primary))}
.cp-slider-wrap{position:relative;padding:14px 0 4px;margin-bottom:8px;overflow:visible}
.cp-fg:has(.cp-slider-wrap) .cp-fg-bd{overflow:visible;max-height:none}
.cp-slider-track{position:relative;height:4px;border-radius:2px;background:hsl(var(--border))}
.cp-slider-range{position:absolute;height:100%;border-radius:2px;background:hsl(var(--primary))}
.cp-slider-input{position:absolute;top:0;left:0;width:100%;height:4px;margin:0;padding:0;background:none;pointer-events:none;-webkit-appearance:none;appearance:none;outline:none}
.cp-slider-input::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;border-radius:50%;background:hsl(var(--card));border:2px solid hsl(var(--primary));cursor:pointer;pointer-events:all;margin-top:-6px;box-shadow:0 1px 3px rgba(0,0,0,.15);transition:transform .1s}
.cp-slider-input::-webkit-slider-thumb:hover{transform:scale(1.15)}
.cp-slider-input::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:hsl(var(--card));border:2px solid hsl(var(--primary));cursor:pointer;pointer-events:all;box-shadow:0 1px 3px rgba(0,0,0,.15)}
.cp-slider-input::-webkit-slider-runnable-track{height:4px;background:transparent}
.cp-slider-input::-moz-range-track{height:4px;background:transparent}
.cp-slider-lo{z-index:3}.cp-slider-hi{z-index:4}
.cp-slider-labels{display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:hsl(var(--muted-foreground))}
.cp-range-inputs{display:flex;align-items:center;gap:4px;margin-top:4px}
.cp-range-in{flex:1;min-width:0;padding:5px 6px;font-size:12px;border:1px solid hsl(var(--border));border-radius:5px;background:hsl(var(--background));color:hsl(var(--foreground));outline:none;text-align:center}.cp-range-in:focus{border-color:hsl(var(--primary))}
.cp-range-in::placeholder{color:hsl(var(--muted-foreground));font-size:11px}
.cp-range-dash{color:hsl(var(--muted-foreground));flex-shrink:0;font-size:12px}
.cp-range-go{padding:5px 10px;font-size:11px;font-weight:600;border:1px solid hsl(var(--primary));border-radius:5px;background:hsl(var(--primary));color:hsl(var(--primary-foreground));cursor:pointer;flex-shrink:0;transition:opacity .15s}.cp-range-go:hover{opacity:.85}
`;
