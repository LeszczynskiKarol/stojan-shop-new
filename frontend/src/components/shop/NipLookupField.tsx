// frontend/src/components/shop/NipLookupField.tsx
// Pole NIP z auto-fill danych firmy z GUS (BIR1 API)
// Wpisz 10 cyfr → klik "Pobierz dane" lub auto-fetch → wypełnia firmę + adres

import { useState, useCallback } from "react";

const API_URL =
  (import.meta as any).env?.PUBLIC_API_URL || "http://localhost:4000";

interface CompanyData {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  regon: string;
}

interface Props {
  nip: string;
  onNipChange: (v: string) => void;
  onCompanyFound: (data: CompanyData) => void;
  error?: string;
}

export function NipLookupField({
  nip,
  onNipChange,
  onCompanyFound,
  error,
}: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [lastResult, setLastResult] = useState<string | null>(null); // NIP that was already looked up

  const formatNip = (v: string) => v.replace(/\D/g, "").slice(0, 10);
  const isValidNip = nip.length === 10;

  const doLookup = useCallback(async () => {
    if (!isValidNip || nip === lastResult) return;

    setIsLoading(true);
    setLookupError("");

    try {
      const res = await fetch(`${API_URL}/api/nip/${nip}`);
      const json = await res.json();

      if (res.status === 429) {
        setLookupError("Zbyt wiele zapytań — wpisz dane ręcznie");
        return;
      }

      if (!json.success) {
        setLookupError(json.error || "Błąd wyszukiwania");
        return;
      }

      if (!json.data.found) {
        setLookupError("Nie znaleziono firmy o podanym NIP");
        setLastResult(nip);
        return;
      }

      const d = json.data;
      onCompanyFound({
        name: d.name,
        street: d.street,
        postalCode: d.postalCode,
        city: d.city,
        regon: d.regon,
      });
      setLastResult(nip);
      setLookupError("");
    } catch {
      setLookupError("Usługa GUS niedostępna — wpisz dane ręcznie");
    } finally {
      setIsLoading(false);
    }
  }, [nip, isValidNip, lastResult, onCompanyFound]);

  return (
    <div>
      <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">
        NIP *
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={nip}
          onChange={(e) => {
            const formatted = formatNip(e.target.value);
            onNipChange(formatted);
            // Reset last result when NIP changes
            if (formatted !== lastResult) {
              setLastResult(null);
              setLookupError("");
            }
          }}
          maxLength={10}
          placeholder="0000000000"
          className={`flex-1 h-10 px-3 rounded-lg border text-sm bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-colors font-mono tracking-wider ${
            error
              ? "border-red-400 dark:border-red-600"
              : "border-[hsl(var(--border))]"
          }`}
        />
        <button
          type="button"
          onClick={doLookup}
          disabled={!isValidNip || isLoading || nip === lastResult}
          className={`h-10 px-4 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
            isValidNip && nip !== lastResult
              ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
              : "bg-[hsl(var(--accent))] text-[hsl(var(--muted-foreground))] cursor-not-allowed"
          }`}
        >
          {isLoading ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              GUS...
            </span>
          ) : nip === lastResult ? (
            "✓ Pobrano"
          ) : (
            "Pobierz dane"
          )}
        </button>
      </div>

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

      {lookupError && !error && (
        <p className="text-xs text-amber-500 mt-1">{lookupError}</p>
      )}

      {!error && !lookupError && isValidNip && nip !== lastResult && (
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
          Kliknij „Pobierz dane" aby automatycznie uzupełnić dane firmy z bazy
          GUS
        </p>
      )}
    </div>
  );
}
