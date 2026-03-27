import React, { useState, useEffect, useCallback, useRef } from "react";

// ============================================================
// TYPES
// ============================================================
interface ShippingRate {
  minWeight: number;
  maxWeight: number;
  prepaidCost: number;
  codCost: number | null;
}

// ============================================================
// API HELPER (reuses same pattern as ProductsTable)
// ============================================================
const API = (import.meta as any).env?.PUBLIC_API_URL || "";

async function api<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const token = document.cookie.match(/(?:^|; )admin_token=([^;]*)/)?.[1] || "";
  const headers: Record<string, string> = {
    ...((opts?.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (opts?.body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API}${path}`, {
    ...opts,
    credentials: "include",
    headers,
  });
  if (res.status === 401) {
    window.location.href = "/admin/login";
    throw new Error("Sesja wygasła");
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// ============================================================
// HELPERS
// ============================================================
function fmtPLN(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("pl-PL", { style: "currency", currency: "PLN" });
}

function emptyRate(): ShippingRate {
  return { minWeight: 0, maxWeight: 0, prepaidCost: 0, codCost: null };
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export function ShippingSettings() {
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [original, setOriginal] = useState<ShippingRate[]>([]);
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<
    { id: number; msg: string; type: "success" | "error" }[]
  >([]);
  const toastId = useRef(0);

  const toast = useCallback(
    (msg: string, type: "success" | "error" = "success") => {
      const id = ++toastId.current;
      setToasts((prev) => [...prev, { id, msg, type }]);
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        3500,
      );
    },
    [],
  );

  // ============================================================
  // FETCH
  // ============================================================
  const fetchRates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<any>("/api/admin/shipping");
      const d = res.data;
      setRates(d.rates);
      setOriginal(JSON.parse(JSON.stringify(d.rates)));
      setIsCustom(d.isCustom);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  // ============================================================
  // SAVE
  // ============================================================
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api<any>("/api/admin/shipping", {
        method: "PUT",
        body: JSON.stringify({ rates }),
      });
      setRates(res.data.rates);
      setOriginal(JSON.parse(JSON.stringify(res.data.rates)));
      setIsCustom(true);
      toast("Stawki wysyłki zapisane");
    } catch (e: any) {
      setError(e.message);
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // RESET TO DEFAULTS
  // ============================================================
  const handleReset = async () => {
    if (
      !confirm(
        "Przywrócić domyślne stawki wysyłki? Obecne ustawienia zostaną usunięte.",
      )
    )
      return;

    setSaving(true);
    try {
      const res = await api<any>("/api/admin/shipping/reset", {
        method: "POST",
      });
      setRates(res.data.rates);
      setOriginal(JSON.parse(JSON.stringify(res.data.rates)));
      setIsCustom(false);
      toast("Przywrócono domyślne stawki");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // ROW OPERATIONS
  // ============================================================
  const updateRate = (
    index: number,
    field: keyof ShippingRate,
    raw: string,
  ) => {
    setRates((prev) => {
      const next = [...prev];
      const row = { ...next[index] };

      if (field === "codCost") {
        row.codCost = raw === "" || raw === "-" ? null : parseFloat(raw) || 0;
      } else {
        (row as any)[field] = parseFloat(raw) || 0;
      }

      next[index] = row;
      return next;
    });
  };

  const addRow = () => {
    setRates((prev) => {
      const last = prev[prev.length - 1];
      const newMin = last ? parseFloat((last.maxWeight + 0.5).toFixed(1)) : 0;
      return [
        ...prev,
        {
          minWeight: newMin,
          maxWeight: newMin + 50,
          prepaidCost: 0,
          codCost: null,
        },
      ];
    });
  };

  const removeRow = (index: number) => {
    if (rates.length <= 1) return;
    setRates((prev) => prev.filter((_, i) => i !== index));
  };

  const moveRow = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= rates.length) return;
    setRates((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  // Auto-fill gaps: set minWeight of each row to maxWeight+0.5 of previous
  const autoFillGaps = () => {
    setRates((prev) => {
      const sorted = [...prev].sort((a, b) => a.minWeight - b.minWeight);
      for (let i = 1; i < sorted.length; i++) {
        sorted[i] = {
          ...sorted[i],
          minWeight: parseFloat((sorted[i - 1].maxWeight + 0.5).toFixed(1)),
        };
      }
      return sorted;
    });
  };

  const hasChanges = JSON.stringify(rates) !== JSON.stringify(original);

  // ============================================================
  // RENDER
  // ============================================================
  if (loading) {
    return (
      <div
        style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}
      >
        Ładowanie stawek wysyłki...
      </div>
    );
  }

  return (
    <div>
      {/* TOOLBAR */}
      <div className="toolbar">
        <div>
          <h1>Stawki wysyłki</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            {isCustom
              ? "Niestandardowe stawki (zapisane w bazie danych)"
              : "Domyślne stawki (z konfiguracji serwera)"}
          </p>
        </div>
        <div className="toolbar-actions">
          {isCustom && (
            <button
              className="btn btn-outline"
              onClick={handleReset}
              disabled={saving}
            >
              ↺ Przywróć domyślne
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? "⏳ Zapisywanie..." : "💾 Zapisz zmiany"}
          </button>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div
          style={{
            padding: "12px 16px",
            marginBottom: 16,
            borderRadius: 8,
            fontSize: 13,
            background: "rgba(239,68,68,.1)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* UNSAVED CHANGES INDICATOR */}
      {hasChanges && (
        <div
          style={{
            padding: "10px 16px",
            marginBottom: 16,
            borderRadius: 8,
            fontSize: 13,
            background: "rgba(245,158,11,.1)",
            border: "1px solid var(--warning)",
            color: "var(--warning)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>⚠️</span>
          <span>Masz niezapisane zmiany</span>
        </div>
      )}

      {/* ACTION BUTTONS */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <button className="btn btn-outline btn-sm" onClick={addRow}>
          + Dodaj pułap wagowy
        </button>
        <button className="btn btn-outline btn-sm" onClick={autoFillGaps}>
          ⚡ Auto-wypełnij luki
        </button>
      </div>

      {/* TABLE */}
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 50, textAlign: "center" }}>#</th>
              <th style={{ minWidth: 130 }}>Min. waga (kg)</th>
              <th style={{ minWidth: 130 }}>Max. waga (kg)</th>
              <th style={{ minWidth: 140 }}>Przedpłata (PLN)</th>
              <th style={{ minWidth: 160 }}>
                Pobranie (PLN)
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 400,
                    color: "var(--text-muted)",
                  }}
                >
                  puste = niedostępne
                </div>
              </th>
              <th style={{ minWidth: 80 }}>Zakres</th>
              <th style={{ width: 120, textAlign: "center" }}>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((rate, i) => {
              // Detect gaps/overlaps
              let gapWarning: string | null = null;
              if (i > 0) {
                const prevMax = rates[i - 1].maxWeight;
                const diff = rate.minWeight - prevMax;
                if (diff <= 0) {
                  gapWarning = `Nachodzenie z poprzednim zakresem!`;
                } else if (diff > 1) {
                  gapWarning = `Luka: ${prevMax}–${rate.minWeight} kg`;
                }
              }

              return (
                <tr key={i}>
                  {/* # */}
                  <td
                    style={{
                      textAlign: "center",
                      color: "var(--text-muted)",
                      fontSize: 12,
                    }}
                  >
                    {i + 1}
                  </td>

                  {/* Min weight */}
                  <td>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={rate.minWeight}
                      onChange={(e) =>
                        updateRate(i, "minWeight", e.target.value)
                      }
                      style={{ width: "100%" }}
                    />
                  </td>

                  {/* Max weight */}
                  <td>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={rate.maxWeight}
                      onChange={(e) =>
                        updateRate(i, "maxWeight", e.target.value)
                      }
                      style={{ width: "100%" }}
                    />
                  </td>

                  {/* Prepaid cost */}
                  <td>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={rate.prepaidCost}
                      onChange={(e) =>
                        updateRate(i, "prepaidCost", e.target.value)
                      }
                      style={{ width: "100%" }}
                    />
                  </td>

                  {/* COD cost */}
                  <td>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={rate.codCost ?? ""}
                        placeholder="—"
                        onChange={(e) =>
                          updateRate(i, "codCost", e.target.value)
                        }
                        style={{ width: "100%" }}
                      />
                      {rate.codCost !== null && (
                        <button
                          title="Wyłącz pobranie dla tego pułapu"
                          onClick={() => updateRate(i, "codCost", "")}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            fontSize: 14,
                            padding: "2px 4px",
                            flexShrink: 0,
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Range display */}
                  <td>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {rate.minWeight}–{rate.maxWeight} kg
                    </div>
                    {gapWarning && (
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--danger)",
                          marginTop: 2,
                        }}
                      >
                        ⚠️ {gapWarning}
                      </div>
                    )}
                    {rate.codCost === null && (
                      <span
                        className="badge badge-yellow"
                        style={{ marginTop: 2 }}
                      >
                        Bez pobrania
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td style={{ textAlign: "center" }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 2,
                        justifyContent: "center",
                      }}
                    >
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => moveRow(i, -1)}
                        disabled={i === 0}
                        title="Przesuń w górę"
                        style={{ fontSize: 12 }}
                      >
                        ▲
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => moveRow(i, 1)}
                        disabled={i === rates.length - 1}
                        title="Przesuń w dół"
                        style={{ fontSize: 12 }}
                      >
                        ▼
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => removeRow(i)}
                        disabled={rates.length <= 1}
                        title="Usuń pułap"
                        style={{ color: "var(--danger)", fontSize: 14 }}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* SUMMARY */}
      <div
        style={{
          marginTop: 20,
          padding: 16,
          borderRadius: 8,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          📊 Podsumowanie
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)" }}>Liczba pułapów:</span>{" "}
            <strong>{rates.length}</strong>
          </div>
          <div style={{ fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)" }}>Zakres wag:</span>{" "}
            <strong>
              {rates.length > 0
                ? `${Math.min(...rates.map((r) => r.minWeight))}–${Math.max(...rates.map((r) => r.maxWeight))} kg`
                : "—"}
            </strong>
          </div>
          <div style={{ fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)" }}>Pobranie do:</span>{" "}
            <strong>
              {(() => {
                const codRates = rates.filter((r) => r.codCost !== null);
                if (codRates.length === 0) return "niedostępne";
                return `${Math.max(...codRates.map((r) => r.maxWeight))} kg`;
              })()}
            </strong>
          </div>
          <div style={{ fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)" }}>
              Cena min/max (przedpłata):
            </span>{" "}
            <strong>
              {rates.length > 0
                ? `${fmtPLN(Math.min(...rates.map((r) => r.prepaidCost)))} / ${fmtPLN(Math.max(...rates.map((r) => r.prepaidCost)))}`
                : "—"}
            </strong>
          </div>
        </div>
      </div>

      {/* TOASTS */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ShippingSettings;
