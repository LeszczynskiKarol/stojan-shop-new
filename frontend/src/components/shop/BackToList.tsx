// frontend/src/components/shop/BackToList.tsx
// Reads stored filter URL from sessionStorage and shows a back-to-list bar
// Falls back to plain category URL if no stored state

import { useState, useEffect } from "react";

// Only these URL params are actual shop filters — everything else (tracking, analytics) is ignored
const FILTER_KEYS = new Set([
  "q",
  "cat",
  "mfr",
  "cond",
  "kw",
  "kwmin",
  "kwmax",
  "rpm",
  "rpmr",
  "obrmin",
  "obrmax",
  "pmin",
  "pmax",
  "sort",
  "page",
]);

export default function BackToList({
  categorySlug,
  categoryName,
}: {
  categorySlug: string;
  categoryName: string;
}) {
  const [backUrl, setBackUrl] = useState(`/${categorySlug}`);
  const [backLabel, setBackLabel] = useState(categoryName);
  const [hasFilters, setHasFilters] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("cp_back_url");
      const storedLabel = sessionStorage.getItem("cp_back_label");
      if (stored) {
        const url = new URL(stored);
        // Akceptuj: ta sama kategoria, /szukaj (wyniki wyszukiwania) lub /marka-producent/...
        const isSameCategory =
          url.pathname === `/${categorySlug}` ||
          url.pathname.startsWith(`/${categorySlug}?`);
        const isSearch = url.pathname === "/szukaj";
        const isManufacturer = url.pathname.startsWith("/marka-producent/");
        if (isSameCategory || isSearch || isManufacturer) {
          // Strip tracking params (_gl, _ga, gclid, fbclid, utm_*, etc.) — keep only shop filter params
          const cleanParams = new URLSearchParams();
          for (const [key, value] of url.searchParams) {
            if (FILTER_KEYS.has(key)) cleanParams.set(key, value);
          }
          const cleanSearch = cleanParams.toString();
          setBackUrl(url.pathname + (cleanSearch ? `?${cleanSearch}` : ""));
          setHasFilters(cleanSearch.length > 0);
          // Dla /szukaj i /marka-producent użyj label zapisanego z poprzedniej strony
          // (np. "Wyniki: 'silnik 3 kw'" zamiast nazwy kategorii produktu)
          if ((isSearch || isManufacturer) && storedLabel) {
            setBackLabel(storedLabel);
          }
        }
      }
    } catch {}
  }, [categorySlug, categoryName]);

  return (
    <a href={backUrl} className="btl-bar">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="btl-arrow"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      <span className="btl-text">
        Wróć do: <strong>{backLabel || categoryName || "lista produktów"}</strong>
      </span>
      {hasFilters && <span className="btl-badge">Filtry aktywne</span>}

      <style>{`
        .btl-bar {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          margin-bottom: 16px;
          background: hsl(var(--accent));
          border: 1px solid hsl(var(--border));
          border-radius: 8px;
          text-decoration: none;
          color: hsl(var(--foreground));
          font-size: 13px;
          transition: all 0.15s;
          cursor: pointer;
        }
        .btl-bar:hover {
          background: hsl(var(--primary) / 0.08);
          border-color: hsl(var(--primary) / 0.3);
          color: hsl(var(--primary));
        }
        .btl-arrow {
          transition: transform 0.15s;
          flex-shrink: 0;
        }
        .btl-bar:hover .btl-arrow {
          transform: translateX(-3px);
        }
        .btl-text {
          line-height: 1.3;
        }
        .btl-text strong {
          font-weight: 600;
        }
        .btl-badge {
          padding: 2px 8px;
          border-radius: 10px;
          background: hsl(var(--primary) / 0.12);
          color: hsl(var(--primary));
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
        }
      `}</style>
    </a>
  );
}
