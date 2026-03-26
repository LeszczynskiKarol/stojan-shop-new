// frontend/src/components/shop/PostalCodeCityField.tsx
// Pole kodu pocztowego z auto-suggest miejscowości
// API: kodpocztowy.intami.pl
// Obsługuje: auto-fill, lista sugestii, ręczne wpisanie, cache

import { useState, useEffect, useRef, useCallback } from "react";

const POSTAL_API = "https://kodpocztowy.intami.pl/api";

interface CityOption {
  name: string;
  gmina: string;
  powiat: string;
  wojewodztwo: string;
}

// ── In-memory cache (persists across re-renders, not across page loads) ──
const postalCache = new Map<string, CityOption[]>();

interface Props {
  postalCode: string;
  onPostalCodeChange: (v: string) => void;
  city: string;
  onCityChange: (v: string) => void;
  postalError?: string;
  cityError?: string;
  idPrefix?: string; // for unique IDs when used for shipping address too
}

export function PostalCodeCityField({
  postalCode,
  onPostalCodeChange,
  city,
  onCityChange,
  postalError,
  cityError,
  idPrefix = "main",
}: Props) {
  const [suggestions, setSuggestions] = useState<CityOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const cityInputRef = useRef<HTMLInputElement>(null);

  // ── Format postal code ──
  const formatPostal = (v: string) => {
    const d = v.replace(/\D/g, "");
    return d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2, 5)}` : d;
  };

  // ── Fetch cities for postal code ──
  const fetchCities = useCallback(async (code: string) => {
    if (!/^\d{2}-\d{3}$/.test(code)) return;

    // Check cache
    if (postalCache.has(code)) {
      const cached = postalCache.get(code)!;
      setSuggestions(cached);
      if (cached.length === 1) {
        onCityChange(cached[0].name);
        setShowDropdown(false);
      } else if (cached.length > 1) {
        setShowDropdown(true);
      }
      return;
    }

    setIsLoading(true);
    setFetchError("");

    try {
      const res = await fetch(`${POSTAL_API}/${code}`, {
        headers: { Accept: "application/json" },
      });

      if (res.status === 429) {
        setFetchError("Limit zapytań API — wpisz miejscowość ręcznie");
        setManualMode(true);
        return;
      }

      if (res.status === 404) {
        setFetchError("Nie znaleziono kodu");
        setSuggestions([]);
        setManualMode(true);
        return;
      }

      if (!res.ok) throw new Error("API error");

      const data = await res.json();
      const items: any[] = Array.isArray(data) ? data : [data];

      // Deduplicate by city + gmina
      const seen = new Map<string, CityOption>();
      for (const item of items) {
        const key = `${item.miejscowosc}_${item.gmina}`;
        if (!seen.has(key)) {
          seen.set(key, {
            name: item.miejscowosc,
            gmina: item.gmina || "",
            powiat: item.powiat || "",
            wojewodztwo: item.wojewodztwo || "",
          });
        }
      }

      const options = Array.from(seen.values());
      postalCache.set(code, options);
      setSuggestions(options);

      if (options.length === 1) {
        // Auto-fill when exactly one city
        onCityChange(options[0].name);
        setShowDropdown(false);
        setManualMode(false);
      } else if (options.length > 1) {
        // Show dropdown for multiple cities
        setShowDropdown(true);
        setManualMode(false);
      } else {
        // No results — manual mode
        setManualMode(true);
      }
    } catch {
      setFetchError("Błąd pobierania — wpisz miejscowość ręcznie");
      setManualMode(true);
    } finally {
      setIsLoading(false);
    }
  }, [onCityChange]);

  // ── Trigger fetch when postal code is complete ──
  useEffect(() => {
    if (/^\d{2}-\d{3}$/.test(postalCode)) {
      fetchCities(postalCode);
    } else {
      setSuggestions([]);
      setShowDropdown(false);
      setFetchError("");
    }
  }, [postalCode, fetchCities]);

  // ── Close dropdown on outside click ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Select city from dropdown ──
  const selectCity = (option: CityOption) => {
    onCityChange(option.name);
    setShowDropdown(false);
    setManualMode(false);
  };

  // ── Switch to manual mode ──
  const enableManualMode = () => {
    setManualMode(true);
    setShowDropdown(false);
    // Focus city input after state update
    setTimeout(() => cityInputRef.current?.focus(), 50);
  };

  const inputClass = (hasError?: string) =>
    `w-full h-10 px-3 rounded-lg border text-sm bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-colors ${
      hasError
        ? "border-red-400 dark:border-red-600"
        : "border-[hsl(var(--border))]"
    }`;

  return (
    <div className="grid sm:grid-cols-[140px_1fr] gap-3">
      {/* Kod pocztowy */}
      <div>
        <label
          htmlFor={`${idPrefix}-postal`}
          className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1"
        >
          Kod pocztowy *
        </label>
        <div className="relative">
          <input
            id={`${idPrefix}-postal`}
            type="text"
            value={postalCode}
            onChange={(e) => onPostalCodeChange(formatPostal(e.target.value))}
            maxLength={6}
            placeholder="00-000"
            className={inputClass(postalError)}
          />
          {isLoading && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        {postalError && (
          <p className="text-xs text-red-500 mt-1">{postalError}</p>
        )}
      </div>

      {/* Miejscowość */}
      <div className="relative" ref={dropdownRef}>
        <label
          htmlFor={`${idPrefix}-city`}
          className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1"
        >
          Miejscowość *
        </label>

        {/* Manual input (always shown, but city might be auto-filled) */}
        <input
          ref={cityInputRef}
          id={`${idPrefix}-city`}
          type="text"
          value={city}
          onChange={(e) => {
            onCityChange(e.target.value);
            // If user starts typing, switch to manual
            if (!manualMode && suggestions.length > 1) {
              setManualMode(true);
              setShowDropdown(false);
            }
          }}
          onFocus={() => {
            // Re-show dropdown if there are multiple suggestions and user hasn't picked
            if (suggestions.length > 1 && !manualMode) {
              setShowDropdown(true);
            }
          }}
          placeholder={isLoading ? "Wyszukiwanie..." : "Miejscowość"}
          className={inputClass(cityError)}
        />

        {cityError && (
          <p className="text-xs text-red-500 mt-1">{cityError}</p>
        )}

        {fetchError && !cityError && (
          <p className="text-xs text-amber-500 mt-1">{fetchError}</p>
        )}

        {/* Auto-fill indicator */}
        {suggestions.length === 1 && city === suggestions[0].name && !manualMode && (
          <button
            type="button"
            onClick={enableManualMode}
            className="text-[10px] text-[hsl(var(--primary))] hover:underline mt-0.5"
          >
            Inna miejscowość? Wpisz ręcznie
          </button>
        )}

        {/* Dropdown for multiple cities */}
        {showDropdown && suggestions.length > 1 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg shadow-xl max-h-48 overflow-y-auto">
            {suggestions.map((opt, i) => (
              <button
                key={`${opt.name}-${opt.gmina}-${i}`}
                type="button"
                onClick={() => selectCity(opt)}
                className="w-full text-left px-3 py-2.5 hover:bg-[hsl(var(--accent))] transition-colors border-b border-[hsl(var(--border))]/50 last:border-0"
              >
                <div className="text-sm font-medium">{opt.name}</div>
                <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                  gm. {opt.gmina} • pow. {opt.powiat} • woj. {opt.wojewodztwo}
                </div>
              </button>
            ))}
            {/* Manual option at the bottom */}
            <button
              type="button"
              onClick={enableManualMode}
              className="w-full text-left px-3 py-2 text-xs text-[hsl(var(--primary))] hover:bg-[hsl(var(--accent))] transition-colors"
            >
              ✏️ Wpisz miejscowość ręcznie
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
