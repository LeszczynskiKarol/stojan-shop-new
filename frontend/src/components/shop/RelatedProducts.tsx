// frontend/src/components/shop/RelatedProducts.tsx
import { useState, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";

interface Product {
  id: string;
  name: string;
  manufacturer: string;
  price: number;
  power: { value: string } | string;
  rpm: { value: string } | string;
  condition: string;
  stock: number;
  mainImage: string | null;
  images: string[];
  marketplaces?: any;
  categories?: any[];
  _similarityScore?: number;
}

const COND_LABELS: Record<string, string> = {
  nowy: "Nowy",
  uzywany: "Używany",
  nieuzywany: "Nieużywany",
};
const COND_BG: Record<string, string> = {
  nowy: "rgba(34,197,94,0.12)",
  uzywany: "rgba(245,158,11,0.12)",
  nieuzywany: "rgba(59,130,246,0.12)",
};
const COND_COLOR: Record<string, string> = {
  nowy: "#22c55e",
  uzywany: "#f59e0b",
  nieuzywany: "#3b82f6",
};

const ROWS_PER_BATCH = 2;
const INITIAL_ROWS = 2;

// First letter of first word uppercase, rest lowercase
function formatName(name: string): string {
  if (!name) return "";
  const lower = name.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// Hide ",00" ending when price is a whole number
function formatPrice(price: number): string {
  if (price % 1 === 0) {
    return price.toLocaleString("pl-PL", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  return price.toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Remove duplicate unit from power value, e.g. "4 kW kW" → "4", "5,5kW" → "5,5"
// We strip ALL "kW" from the raw value and then display " kW" in the template
function cleanPower(val: string | undefined | null): string | null {
  if (!val || val === "0") return null;
  const stripped = val.replace(/\s*kw\s*/gi, " ").trim();
  return stripped || null;
}

export default function RelatedProducts({ products }: { products: Product[] }) {
  const visible = products.filter((p) => p.stock > 0);
  const gridRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(4);
  const [shown, setShown] = useState(INITIAL_ROWS * 4);

  // Detect actual column count from rendered grid
  useEffect(() => {
    const detect = () => {
      if (!gridRef.current || !gridRef.current.children.length) return;
      const gridStyle = window.getComputedStyle(gridRef.current);
      const colCount = gridStyle
        .getPropertyValue("grid-template-columns")
        .split(" ").length;
      setCols(colCount);
    };
    detect();
    window.addEventListener("resize", detect);
    return () => window.removeEventListener("resize", detect);
  }, [visible.length, shown]);

  // Recalculate shown when cols change to keep full rows
  useEffect(() => {
    setShown((prev) => {
      const rows = Math.max(INITIAL_ROWS, Math.ceil(prev / cols));
      return rows * cols;
    });
  }, [cols]);

  if (visible.length === 0) return null;

  // Always show full rows
  const displayCount = Math.min(
    shown,
    Math.floor(visible.length / cols) * cols || cols,
  );
  const displayed = visible.slice(0, displayCount);
  const hasMore = displayCount < visible.length;
  const remaining = visible.length - displayCount;

  const showMore = () => {
    setShown((s) => s + ROWS_PER_BATCH * cols);
  };

  const getUrl = (p: Product) => {
    const slug = (p.marketplaces as any)?.ownStore?.slug;
    const cat =
      p.categories?.[0]?.category?.slug ||
      p.categories?.[0]?.slug ||
      "trojfazowe";
    if (!slug) return `/produkt/${p.id}`;
    return `/${cat}/${slug}`;
  };

  const getPower = (p: Product): string | null => {
    const raw = typeof p.power === "object" ? p.power?.value : p.power;
    return cleanPower(raw);
  };

  const getRpm = (p: Product) => {
    if (typeof p.rpm === "object") return p.rpm?.value;
    return p.rpm;
  };

  return (
    <section className="mb-12">
      <h2
        style={{
          fontSize: "1.25rem",
          fontWeight: 700,
          color: "hsl(var(--foreground))",
          marginBottom: "1.25rem",
        }}
      >
        Podobne produkty
      </h2>

      <div ref={gridRef} className="rp-grid">
        {displayed.map((p) => {
          const img = p.mainImage || p.images?.[0];
          const pw = getPower(p);
          const rpm = getRpm(p);
          const cc = COND_COLOR[p.condition] || "#22c55e";
          const cb = COND_BG[p.condition] || "rgba(34,197,94,0.12)";

          return (
            <a
              key={p.id}
              href={getUrl(p)}
              style={{
                display: "flex",
                flexDirection: "column",
                border: "1px solid hsl(var(--border))",
                borderRadius: "12px",
                background: "hsl(var(--card))",
                overflow: "hidden",
                textDecoration: "none",
                color: "inherit",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "hsl(var(--primary) / 0.4)";
                e.currentTarget.style.boxShadow =
                  "0 4px 20px hsl(var(--primary) / 0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "hsl(var(--border))";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div
                style={{
                  aspectRatio: "1",
                  background: "hsl(var(--accent))",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {img ? (
                  <img
                    src={img}
                    alt={p.name}
                    loading="lazy"
                    width={300}
                    height={300}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "hsl(var(--muted-foreground))",
                      fontSize: "12px",
                    }}
                  >
                    Brak zdjęcia
                  </div>
                )}
                <span
                  style={{
                    position: "absolute",
                    top: "8px",
                    left: "8px",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "10px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                    background: cb,
                    color: cc,
                  }}
                >
                  {COND_LABELS[p.condition] || p.condition}
                </span>
              </div>
              <div
                style={{
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                }}
              >
                {p.manufacturer && p.manufacturer !== "silnik" && (
                  <p
                    style={{
                      fontSize: "10px",
                      color: "hsl(var(--muted-foreground))",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      margin: 0,
                    }}
                  >
                    {p.manufacturer}
                  </p>
                )}
                <h3
                  style={{
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "hsl(var(--card-foreground))",
                    margin: "4px 0 0",
                    lineHeight: 1.35,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {formatName(p.name)}
                </h3>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    marginTop: "8px",
                    fontSize: "11px",
                    color: "hsl(var(--muted-foreground))",
                  }}
                >
                  {pw && (
                    <span
                      style={{
                        padding: "1px 6px",
                        borderRadius: "3px",
                        background: "hsl(var(--accent))",
                      }}
                    >
                      {pw} kW
                    </span>
                  )}
                  {rpm && rpm !== "0" && (
                    <span
                      style={{
                        padding: "1px 6px",
                        borderRadius: "3px",
                        background: "hsl(var(--accent))",
                      }}
                    >
                      {rpm} obr
                    </span>
                  )}
                </div>
                <div
                  style={{
                    marginTop: "auto",
                    paddingTop: "10px",
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      fontSize: "16px",
                      fontWeight: 700,
                      color: "hsl(var(--foreground))",
                    }}
                  >
                    {formatPrice(p.price)} zł
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#22c55e",
                      fontWeight: 500,
                    }}
                  >
                    {p.stock} szt.
                  </span>
                </div>
              </div>
            </a>
          );
        })}
      </div>

      {hasMore && (
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <button
            onClick={showMore}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 24px",
              fontSize: "13px",
              fontWeight: 500,
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              background: "hsl(var(--card))",
              color: "hsl(var(--foreground))",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "hsl(var(--primary) / 0.5)";
              e.currentTarget.style.color = "hsl(var(--primary))";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "hsl(var(--border))";
              e.currentTarget.style.color = "hsl(var(--foreground))";
            }}
          >
            Pokaż więcej ({Math.min(remaining, ROWS_PER_BATCH * cols)} z{" "}
            {remaining})
            <ChevronDown size={16} />
          </button>
        </div>
      )}

      <style>{`
        .rp-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(2, 1fr);
        }
        @media (min-width: 640px) {
          .rp-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (min-width: 1024px) {
          .rp-grid { grid-template-columns: repeat(4, 1fr); }
        }
      `}</style>
    </section>
  );
}
