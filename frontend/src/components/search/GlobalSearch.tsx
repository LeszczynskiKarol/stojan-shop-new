// frontend/src/components/search/GlobalSearch.tsx
// Compact search for header + hero variant
// Reads API URL from window.__API_URL (injected by BaseLayout)
// Enter → navigates to /szukaj?q=...
// Typing → autocomplete dropdown

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, X, Loader2 } from "lucide-react";

interface Result {
  id: string;
  name: string;
  price: number;
  mainImage?: string;
  power?: { value: string };
  rpm?: { value: string };
  condition?: string;
  manufacturer?: string;
  marketplaces?: { ownStore?: { slug?: string } };
  categories?: Array<{ category?: { slug: string }; slug?: string }>;
}

const COND_COLORS: Record<string, string> = {
  nowy: "#22c55e",
  uzywany: "#f59e0b",
  nieuzywany: "#3b82f6",
};
const COND_LABELS: Record<string, string> = {
  nowy: "Nowy",
  uzywany: "Używany",
  nieuzywany: "Nieużywany",
};

function getApiUrl(): string {
  if (typeof window !== "undefined" && (window as any).__API_URL) {
    return (window as any).__API_URL;
  }
  return "";
}

export function GlobalSearch({
  variant = "header",
  apiUrl: apiUrlProp,
}: {
  variant?: "header" | "hero";
  apiUrl?: string;
}) {
  const [dropPos, setDropPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isHero = variant === "hero";

  const resolveApiUrl = useCallback(() => {
    return apiUrlProp || getApiUrl() || "";
  }, [apiUrlProp]);

  const search = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setResults([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const base = resolveApiUrl();
        const res = await fetch(
          `${base}/api/products?search=${encodeURIComponent(q)}&limit=6&inStock=true`,
        );
        const json = await res.json();
        if (json.success) {
          setResults(json.data.products || []);
          setOpen(true);
          setSelectedIdx(-1);
        }
      } catch (err) {
        console.error("Search error:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [resolveApiUrl],
  );

  // Recalculate dropdown position when open
  useEffect(() => {
    if (!open || !wrapRef.current) {
      setDropPos(null);
      return;
    }
    const update = () => {
      const rect = wrapRef.current!.getBoundingClientRect();
      setDropPos({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, results]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 250);
  };

  const clear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  const getUrl = (p: Result) => {
    const cat =
      p.categories?.[0]?.category?.slug ||
      p.categories?.[0]?.slug ||
      "trojfazowe";
    const slug = p.marketplaces?.ownStore?.slug || p.id;
    return `/${cat}/${slug}`;
  };

  const goToSearchPage = () => {
    if (query.trim().length > 0) {
      window.location.href = `/szukaj?q=${encodeURIComponent(query.trim())}`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIdx >= 0 && results[selectedIdx]) {
        window.location.href = getUrl(results[selectedIdx]);
      } else {
        goToSearchPage();
      }
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div
      ref={wrapRef}
      className={isHero ? "gs-wrap gs-hero" : "gs-wrap gs-header"}
    >
      <div className="gs-input-wrap">
        <Search size={isHero ? 20 : 16} className="gs-icon" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={
            isHero
              ? "Szukaj silnika: np. 4kW 1400obr, SEW, Siemens..."
              : "Szukaj produktu..."
          }
          className="gs-input"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="Wyszukiwarka produktów"
          name="q"
        />
        {loading && <Loader2 size={16} className="gs-spinner" />}
        {query && !loading && (
          <button
            type="button"
            onClick={clear}
            className="gs-clear"
            aria-label="Wyczyść"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && results.length > 0 && dropPos && (
        <div
          className="gs-dropdown"
          role="listbox"
          style={{
            top: dropPos.top,
            left: dropPos.left,
            width: dropPos.width,
          }}
        >
          {results.map((p, i) => (
            <a
              key={p.id}
              href={getUrl(p)}
              className={`gs-result${i === selectedIdx ? " gs-sel" : ""}`}
              role="option"
              aria-selected={i === selectedIdx}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <div className="gs-result-img">
                {p.mainImage ? (
                  <img src={p.mainImage} alt="" loading="lazy" />
                ) : (
                  <div className="gs-no-img" />
                )}
              </div>
              <div className="gs-result-info">
                <div className="gs-result-name">{p.name}</div>
                <div className="gs-result-meta">
                  {p.manufacturer && <span>{p.manufacturer}</span>}
                  {p.power?.value && <span>{p.power.value} kW</span>}
                  {p.rpm?.value && <span>{p.rpm.value} obr</span>}
                  {p.condition && (
                    <span
                      style={{
                        color: COND_COLORS[p.condition] || "#888",
                      }}
                    >
                      {COND_LABELS[p.condition] || p.condition}
                    </span>
                  )}
                </div>
              </div>
              <div className="gs-result-price">
                {Number(p.price).toLocaleString("pl-PL")} zł
              </div>
            </a>
          ))}
          <a href={`/szukaj?q=${encodeURIComponent(query)}`} className="gs-all">
            Wszystkie wyniki dla „{query}" →
          </a>
        </div>
      )}

      {open &&
        query.length >= 2 &&
        results.length === 0 &&
        !loading &&
        dropPos && (
          <div
            className="gs-dropdown gs-empty-dd"
            style={{
              top: dropPos.top,
              left: dropPos.left,
              width: dropPos.width,
            }}
          >
            <div className="gs-empty-msg">
              Brak wyników dla „{query}"
              <br />
              <span style={{ fontSize: "12px", opacity: 0.7 }}>
                Spróbuj innej frazy lub{" "}
                <a
                  href="/kontakt"
                  style={{
                    color: "hsl(var(--primary))",
                    textDecoration: "underline",
                  }}
                >
                  skontaktuj się z nami
                </a>
              </span>
            </div>
          </div>
        )}

      <style>{`
        .gs-wrap { position: relative; width: 100%; }
        .gs-header { max-width: 360px; }
        .gs-hero { max-width: 640px; margin: 0 auto; }

        .gs-input-wrap { position: relative; display: flex; align-items: center; }
        .gs-icon { position: absolute; left: 12px; color: hsl(var(--muted-foreground)); pointer-events: none; flex-shrink: 0; z-index: 1; }
        .gs-input {
          width: 100%;
          border: 1px solid hsl(var(--border));
          border-radius: 10px;
          background: hsl(var(--card));
          color: hsl(var(--foreground));
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .gs-input:focus { border-color: hsl(var(--primary)); box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1); }
        .gs-input::placeholder { color: hsl(var(--muted-foreground)); }

        .gs-header .gs-input { padding: 8px 36px 8px 36px; font-size: 13px; }
        .gs-hero .gs-input { padding: 16px 48px 16px 48px; font-size: 16px; border-width: 2px; border-radius: 14px; }
        .gs-hero .gs-icon { left: 16px; }

        .gs-spinner { position: absolute; right: 12px; color: hsl(var(--primary)); animation: gs-spin 0.6s linear infinite; }
        .gs-clear { position: absolute; right: 10px; background: hsl(var(--accent)); border: none; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: hsl(var(--muted-foreground)); transition: all 0.1s; }
        .gs-clear:hover { background: hsl(var(--border)); color: hsl(var(--foreground)); }

        .gs-dropdown {
          position: fixed;
          background: hsl(var(--card)); border: 1px solid hsl(var(--border));
          border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.18);
          z-index: 9999; overflow: hidden;
        }


        .gs-result {
          display: flex; align-items: center; gap: 10px; padding: 10px 14px;
          text-decoration: none; color: inherit; transition: background 0.1s; cursor: pointer;
        }
        .gs-result:hover, .gs-sel { background: hsl(var(--accent)); }
        .gs-result + .gs-result { border-top: 1px solid hsl(var(--border) / 0.5); }

        .gs-result-img { width: 44px; height: 44px; border-radius: 6px; overflow: hidden; background: hsl(var(--accent)); flex-shrink: 0; }
        .gs-result-img img { width: 100%; height: 100%; object-fit: contain; }
        .gs-no-img { width: 100%; height: 100%; background: hsl(var(--border)); }

        .gs-result-info { flex: 1; min-width: 0; }
        .gs-result-name { font-size: 13px; font-weight: 500; color: hsl(var(--foreground)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .gs-result-meta { display: flex; gap: 6px; font-size: 11px; color: hsl(var(--muted-foreground)); margin-top: 2px; flex-wrap: wrap; }
        .gs-result-price { font-size: 14px; font-weight: 700; color: hsl(var(--primary)); white-space: nowrap; flex-shrink: 0; }

        .gs-all {
          display: block; text-align: center; padding: 10px; font-size: 13px;
          color: hsl(var(--primary)); text-decoration: none; border-top: 1px solid hsl(var(--border));
          transition: background 0.1s;
        }
        .gs-all:hover { background: hsl(var(--accent)); }

        .gs-empty-dd { padding: 0; }
        .gs-empty-msg { padding: 20px; text-align: center; font-size: 13px; color: hsl(var(--muted-foreground)); }

        @keyframes gs-spin { to { transform: rotate(360deg); } }

        @media (max-width: 768px) {
          .gs-header { max-width: 100%; }
          .gs-hero .gs-input { padding: 14px 40px 14px 44px; font-size: 15px; }
        }
      `}</style>
    </div>
  );
}
