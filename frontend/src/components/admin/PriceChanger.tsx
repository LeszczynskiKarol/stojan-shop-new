// frontend/src/components/admin/PriceChanger.tsx
// Masowa zmiana cen produktów po kategoriach — podgląd, zatwierdzanie, rollback

import React, { useState, useEffect, useCallback, useRef } from "react";

// ============================================================
// TYPES
// ============================================================
interface Category {
  id: string;
  name: string;
  slug: string;
}

interface PricePreviewItem {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  oldPrice: number;
  newPrice: number;
  oldAllegroPrice: number | null;
  newAllegroPrice: number | null;
}

interface PreviewStats {
  count: number;
  percentage: number;
  totalOldPrice: number;
  totalNewPrice: number;
  totalDiff: number;
}

interface PriceBatch {
  id: string;
  categoryIds: string[];
  categoryNames: string[];
  percentage: number;
  affectedCount: number;
  appliedAt: string;
  rolledBackAt: string | null;
}

// ============================================================
// API HELPER
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
function fmtPrice(v: number): string {
  return v.toLocaleString("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtPercent(v: number): string {
  return `${v > 0 ? "+" : ""}${v}%`;
}

// Filtrowanie kategorii — te same co w ProductsTable
const CATEGORY_KEYWORDS = [
  "trójfazowe",
  "jednofazowe",
  "dwubiegow",
  "motoreduktory",
  "akcesoria",
  "pierścieniowe",
  "wentylator",
  "hamul",
];

function shouldShowCategory(name: string): boolean {
  return CATEGORY_KEYWORDS.some((w) =>
    name.toLowerCase().includes(w.toLowerCase()),
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export function PriceChanger() {
  // --- DATA ---
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [percentage, setPercentage] = useState<string>("");
  const [changeAllegro, setChangeAllegro] = useState(false);

  // --- PREVIEW ---
  const [preview, setPreview] = useState<PricePreviewItem[] | null>(null);
  const [previewStats, setPreviewStats] = useState<PreviewStats | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewSort, setPreviewSort] = useState<{
    field: string;
    dir: "asc" | "desc";
  }>({ field: "productName", dir: "asc" });

  // --- APPLY ---
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{
    batchId: string;
    count: number;
  } | null>(null);

  // --- HISTORY ---
  const [history, setHistory] = useState<PriceBatch[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  // --- TOASTS ---
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
        4000,
      );
    },
    [],
  );

  // --- CONFIRM MODAL ---
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    desc: string;
    label: string;
    variant: "danger" | "warning" | "primary";
    onConfirm: (() => void) | null;
  }>({
    open: false,
    title: "",
    desc: "",
    label: "",
    variant: "primary",
    onConfirm: null,
  });

  // ============================================================
  // LOAD DATA
  // ============================================================
  useEffect(() => {
    api("/api/admin/products/categories")
      .then((r) =>
        setCategories(
          r.data.filter((c: Category) => shouldShowCategory(c.name)),
        ),
      )
      .catch(() => {});
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await api<any>("/api/admin/price-changes/history");
      setHistory(res.data || []);
    } catch {
    } finally {
      setHistoryLoading(false);
    }
  };

  // ============================================================
  // CATEGORY SELECTION
  // ============================================================
  const toggleCategory = (id: string) => {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    // Reset preview when selection changes
    setPreview(null);
    setPreviewStats(null);
    setApplied(null);
  };

  const selectAll = () => {
    const allSelected = categories.every((c) => selectedCats.has(c.id));
    if (allSelected) {
      setSelectedCats(new Set());
    } else {
      setSelectedCats(new Set(categories.map((c) => c.id)));
    }
    setPreview(null);
    setPreviewStats(null);
  };

  // ============================================================
  // PREVIEW
  // ============================================================
  const handlePreview = async () => {
    const pct = parseFloat(percentage);
    if (!pct || isNaN(pct)) {
      toast("Podaj prawidłowy procent zmiany", "error");
      return;
    }
    if (selectedCats.size === 0) {
      toast("Wybierz co najmniej jedną kategorię", "error");
      return;
    }

    setPreviewLoading(true);
    setApplied(null);
    try {
      const res = await api<any>("/api/admin/price-changes/preview", {
        method: "POST",
        body: JSON.stringify({
          categoryIds: Array.from(selectedCats),
          percentage: pct,
          changeAllegro,
        }),
      });
      setPreview(res.data.products);
      setPreviewStats(res.data.stats);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setPreviewLoading(false);
    }
  };

  // ============================================================
  // APPLY
  // ============================================================
  const handleApply = () => {
    if (!previewStats) return;
    setConfirmModal({
      open: true,
      title: `Zmienić ceny ${previewStats.count} produktów?`,
      desc: `Zmiana: ${fmtPercent(previewStats.percentage)}\nŁączna różnica: ${fmtPrice(previewStats.totalDiff)}\n\nTa operacja jest odwracalna — snapshot zostanie zachowany.`,
      label: "Zatwierdź zmianę cen",
      variant: previewStats.percentage > 0 ? "primary" : "warning",
      onConfirm: async () => {
        setApplying(true);
        try {
          const res = await api<any>("/api/admin/price-changes/apply", {
            method: "POST",
            body: JSON.stringify({
              categoryIds: Array.from(selectedCats),
              percentage: parseFloat(percentage),
              changeAllegro,
            }),
          });
          setApplied({
            batchId: res.data.batchId,
            count: res.data.affectedCount,
          });
          toast(
            `Zmieniono ceny ${res.data.affectedCount} produktów (${fmtPercent(parseFloat(percentage))})`,
          );
          loadHistory();
        } catch (e: any) {
          toast(e.message, "error");
        } finally {
          setApplying(false);
        }
      },
    });
  };

  // ============================================================
  // ROLLBACK
  // ============================================================
  const handleRollback = (batch: PriceBatch) => {
    setConfirmModal({
      open: true,
      title: "Cofnąć zmianę cen?",
      desc: `Przywrócić oryginalne ceny dla ${batch.affectedCount} produktów?\n\nZmiana z ${fmtDate(batch.appliedAt)} (${fmtPercent(batch.percentage)})`,
      label: "Cofnij zmiany",
      variant: "danger",
      onConfirm: async () => {
        setRollingBack(batch.id);
        try {
          const res = await api<any>(
            `/api/admin/price-changes/rollback/${batch.id}`,
            { method: "POST" },
          );
          toast(
            `Cofnięto zmiany — przywrócono ceny ${res.data.restoredCount} produktów`,
          );
          loadHistory();
          // Reset preview if it was for this batch
          setPreview(null);
          setPreviewStats(null);
          setApplied(null);
        } catch (e: any) {
          toast(e.message, "error");
        } finally {
          setRollingBack(null);
        }
      },
    });
  };

  // ============================================================
  // PREVIEW SORT
  // ============================================================
  const sortedPreview = preview
    ? [...preview]
        .filter(
          (p) =>
            !previewSearch ||
            p.productName.toLowerCase().includes(previewSearch.toLowerCase()) ||
            p.categoryName.toLowerCase().includes(previewSearch.toLowerCase()),
        )
        .sort((a, b) => {
          const f = previewSort.field as keyof PricePreviewItem;
          const va = a[f] ?? 0;
          const vb = b[f] ?? 0;
          const cmp =
            typeof va === "string"
              ? va.localeCompare(vb as string, "pl")
              : (va as number) - (vb as number);
          return previewSort.dir === "asc" ? cmp : -cmp;
        })
    : null;

  const handlePreviewSort = (field: string) => {
    setPreviewSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" },
    );
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div>
      {/* ======== TOOLBAR ======== */}
      <div className="toolbar">
        <h1>Masowa zmiana cen</h1>
      </div>

      {/* ======== KONFIGURACJA ======== */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginBottom: 24,
        }}
      >
        {/* --- Kolumna lewa: kategorie --- */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 16,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Wybierz kategorie</h3>
            <button
              className="btn btn-ghost btn-sm"
              onClick={selectAll}
              style={{ fontSize: 12 }}
            >
              {categories.every((c) => selectedCats.has(c.id))
                ? "Odznacz wszystkie"
                : "Zaznacz wszystkie"}
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
            }}
          >
            {categories.map((cat) => {
              const checked = selectedCats.has(cat.id);
              return (
                <label
                  key={cat.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 6,
                    cursor: "pointer",
                    background: checked
                      ? "rgba(99,102,241,0.1)"
                      : "transparent",
                    border: `1px solid ${checked ? "var(--primary)" : "var(--border)"}`,
                    transition: "all .15s",
                    fontSize: 13,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCategory(cat.id)}
                  />
                  <span style={{ fontWeight: checked ? 600 : 400 }}>
                    {cat.name}
                  </span>
                </label>
              );
            })}
          </div>

          {selectedCats.size > 0 && (
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              Zaznaczono: {selectedCats.size} z {categories.length} kategorii
            </div>
          )}
        </div>

        {/* --- Kolumna prawa: parametry --- */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 16,
            boxShadow: "var(--shadow-sm)",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>Parametry zmiany</h3>

          {/* Procent */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 6,
              }}
            >
              Procent zmiany ceny
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number"
                value={percentage}
                onChange={(e) => {
                  setPercentage(e.target.value);
                  setPreview(null);
                  setPreviewStats(null);
                  setApplied(null);
                }}
                placeholder="np. 10 lub -5"
                step="0.1"
                style={{ width: 140, fontSize: 16, padding: "10px 14px" }}
              />
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                }}
              >
                %
              </span>
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              Wartość dodatnia = podwyżka, ujemna = obniżka
            </div>
          </div>

          {/* Szybkie przyciski */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--text-muted)",
                marginBottom: 6,
              }}
            >
              Szybki wybór:
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[-10, -5, -3, 3, 5, 10, 15, 20].map((v) => (
                <button
                  key={v}
                  className="btn btn-outline btn-sm"
                  style={{
                    background:
                      percentage === String(v) ? "var(--primary)" : undefined,
                    color: percentage === String(v) ? "#fff" : undefined,
                    borderColor:
                      percentage === String(v) ? "var(--primary)" : undefined,
                  }}
                  onClick={() => {
                    setPercentage(String(v));
                    setPreview(null);
                    setPreviewStats(null);
                    setApplied(null);
                  }}
                >
                  {v > 0 ? "+" : ""}
                  {v}%
                </button>
              ))}
            </div>
          </div>

          {/* Allegro checkbox */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              cursor: "pointer",
              padding: "8px 0",
            }}
          >
            <input
              type="checkbox"
              checked={changeAllegro}
              onChange={(e) => {
                setChangeAllegro(e.target.checked);
                setPreview(null);
                setPreviewStats(null);
              }}
            />
            Zmień też cenę Allegro (jeśli powiązane)
          </label>

          {/* Przycisk podglądu */}
          <button
            className="btn btn-primary"
            onClick={handlePreview}
            disabled={previewLoading || selectedCats.size === 0 || !percentage}
            style={{ width: "100%", padding: "12px", fontSize: 14 }}
          >
            {previewLoading ? "⏳ Generuję podgląd..." : "🔍 Podgląd zmian"}
          </button>
        </div>
      </div>

      {/* ======== PREVIEW TABLE ======== */}
      {previewStats && sortedPreview && (
        <div style={{ marginBottom: 24 }}>
          {/* Stats bar */}
          <div
            style={{
              display: "flex",
              gap: 16,
              alignItems: "center",
              padding: "12px 16px",
              background:
                previewStats.percentage > 0
                  ? "rgba(34,197,94,0.08)"
                  : "rgba(239,68,68,0.08)",
              border: `1px solid ${previewStats.percentage > 0 ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
              borderRadius: "8px 8px 0 0",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {previewStats.percentage > 0 ? "📈" : "📉"} Podgląd:{" "}
              {fmtPercent(previewStats.percentage)}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Produktów: <b>{previewStats.count}</b>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Suma przed: <b>{fmtPrice(previewStats.totalOldPrice)}</b>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Suma po: <b>{fmtPrice(previewStats.totalNewPrice)}</b>
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color:
                  previewStats.totalDiff > 0
                    ? "var(--success)"
                    : "var(--danger)",
              }}
            >
              Różnica: {fmtPrice(previewStats.totalDiff)}
            </div>

            <div style={{ marginLeft: "auto" }}>
              {!applied ? (
                <button
                  className="btn btn-primary"
                  onClick={handleApply}
                  disabled={applying}
                  style={{ fontSize: 13 }}
                >
                  {applying ? "⏳ Zapisywanie..." : "✅ Zatwierdź zmiany"}
                </button>
              ) : (
                <span
                  className="badge badge-green"
                  style={{ fontSize: 13, padding: "6px 14px" }}
                >
                  ✅ Zastosowano (batch: {applied.batchId})
                </span>
              )}
            </div>
          </div>

          {/* Search */}
          <div
            style={{
              padding: "8px 12px",
              background: "var(--bg-card)",
              borderLeft: "1px solid var(--border)",
              borderRight: "1px solid var(--border)",
            }}
          >
            <input
              type="search"
              placeholder="Filtruj produkty w podglądzie..."
              value={previewSearch}
              onChange={(e) => setPreviewSearch(e.target.value)}
              style={{ width: "100%", fontSize: 12 }}
            />
          </div>

          {/* Table */}
          <div
            className="admin-table-wrap"
            style={{
              borderRadius: "0 0 8px 8px",
              maxHeight: "50vh",
            }}
          >
            <table>
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th
                    style={{ cursor: "pointer" }}
                    onClick={() => handlePreviewSort("productName")}
                  >
                    Produkt{" "}
                    {previewSort.field === "productName"
                      ? previewSort.dir === "asc"
                        ? "▲"
                        : "▼"
                      : "⇅"}
                  </th>
                  <th
                    style={{ cursor: "pointer" }}
                    onClick={() => handlePreviewSort("categoryName")}
                  >
                    Kategoria{" "}
                    {previewSort.field === "categoryName"
                      ? previewSort.dir === "asc"
                        ? "▲"
                        : "▼"
                      : "⇅"}
                  </th>
                  <th
                    style={{ cursor: "pointer", textAlign: "right" }}
                    onClick={() => handlePreviewSort("oldPrice")}
                  >
                    Cena teraz{" "}
                    {previewSort.field === "oldPrice"
                      ? previewSort.dir === "asc"
                        ? "▲"
                        : "▼"
                      : "⇅"}
                  </th>
                  <th style={{ textAlign: "center" }}>→</th>
                  <th
                    style={{ cursor: "pointer", textAlign: "right" }}
                    onClick={() => handlePreviewSort("newPrice")}
                  >
                    Cena nowa{" "}
                    {previewSort.field === "newPrice"
                      ? previewSort.dir === "asc"
                        ? "▲"
                        : "▼"
                      : "⇅"}
                  </th>
                  <th style={{ textAlign: "right" }}>Różnica</th>
                  {changeAllegro && (
                    <>
                      <th style={{ textAlign: "right" }}>Allegro teraz</th>
                      <th style={{ textAlign: "right" }}>Allegro nowa</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedPreview.map((item, i) => {
                  const diff = item.newPrice - item.oldPrice;
                  return (
                    <tr key={item.productId}>
                      <td style={{ color: "var(--text-muted)", fontSize: 11 }}>
                        {i + 1}
                      </td>
                      <td>
                        <span style={{ fontSize: 13 }}>{item.productName}</span>
                      </td>
                      <td>
                        <span
                          className="badge badge-yellow"
                          style={{ fontSize: 11 }}
                        >
                          {item.categoryName}
                        </span>
                      </td>
                      <td
                        style={{ textAlign: "right", fontFamily: "monospace" }}
                      >
                        {fmtPrice(item.oldPrice)}
                      </td>
                      <td style={{ textAlign: "center", fontSize: 11 }}>→</td>
                      <td
                        style={{
                          textAlign: "right",
                          fontFamily: "monospace",
                          fontWeight: 600,
                        }}
                      >
                        {fmtPrice(item.newPrice)}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontFamily: "monospace",
                          fontSize: 12,
                          color: diff > 0 ? "var(--success)" : "var(--danger)",
                        }}
                      >
                        {diff > 0 ? "+" : ""}
                        {fmtPrice(diff)}
                      </td>
                      {changeAllegro && (
                        <>
                          <td
                            style={{
                              textAlign: "right",
                              fontFamily: "monospace",
                              color: "var(--text-muted)",
                            }}
                          >
                            {item.oldAllegroPrice !== null
                              ? fmtPrice(item.oldAllegroPrice)
                              : "—"}
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              fontFamily: "monospace",
                              color: "var(--text-muted)",
                            }}
                          >
                            {item.newAllegroPrice !== null
                              ? fmtPrice(item.newAllegroPrice)
                              : "—"}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
                {sortedPreview.length === 0 && (
                  <tr>
                    <td
                      colSpan={changeAllegro ? 9 : 7}
                      style={{
                        textAlign: "center",
                        padding: 30,
                        color: "var(--text-muted)",
                      }}
                    >
                      {previewSearch
                        ? "Brak produktów pasujących do filtra"
                        : "Brak produktów w wybranych kategoriach"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======== HISTORY ======== */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 16,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>Historia zmian cen</h3>
          <button
            className="btn btn-ghost btn-sm"
            onClick={loadHistory}
            disabled={historyLoading}
          >
            {historyLoading ? "⏳" : "🔄"} Odśwież
          </button>
        </div>

        {history.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: 30,
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            Brak historii zmian cen
          </div>
        ) : (
          <div className="admin-table-wrap" style={{ maxHeight: 400 }}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Data</th>
                  <th>Zmiana</th>
                  <th>Produktów</th>
                  <th>Kategorie</th>
                  <th>Status</th>
                  <th>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {history.map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      <code style={{ fontSize: 11 }}>{batch.id}</code>
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                      {fmtDate(batch.appliedAt)}
                    </td>
                    <td>
                      <span
                        style={{
                          fontWeight: 600,
                          color:
                            batch.percentage > 0
                              ? "var(--success)"
                              : "var(--danger)",
                        }}
                      >
                        {fmtPercent(batch.percentage)}
                      </span>
                    </td>
                    <td>{batch.affectedCount}</td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          gap: 4,
                          flexWrap: "wrap",
                        }}
                      >
                        {batch.categoryNames.map((name, i) => (
                          <span
                            key={i}
                            className="badge badge-yellow"
                            style={{ fontSize: 10 }}
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      {batch.rolledBackAt ? (
                        <span className="badge badge-red">
                          ↩️ Cofnięto {fmtDate(batch.rolledBackAt)}
                        </span>
                      ) : (
                        <span className="badge badge-green">Aktywna</span>
                      )}
                    </td>
                    <td>
                      {!batch.rolledBackAt && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleRollback(batch)}
                          disabled={rollingBack === batch.id}
                        >
                          {rollingBack === batch.id ? "⏳..." : "↩️ Cofnij"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======== CONFIRM MODAL ======== */}
      {confirmModal.open && (
        <div
          className="modal-backdrop"
          onClick={() =>
            setConfirmModal((p) => ({ ...p, open: false, onConfirm: null }))
          }
        >
          <div
            className="modal delete-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="modal-body"
              style={{ paddingTop: 28, paddingBottom: 8 }}
            >
              <div
                className="delete-icon"
                style={{
                  background:
                    confirmModal.variant === "danger"
                      ? "rgba(239,68,68,.12)"
                      : confirmModal.variant === "warning"
                        ? "rgba(245,158,11,.12)"
                        : "rgba(99,102,241,.12)",
                }}
              >
                {confirmModal.variant === "danger"
                  ? "↩️"
                  : confirmModal.variant === "warning"
                    ? "⚠️"
                    : "💰"}
              </div>
              <div className="delete-title">{confirmModal.title}</div>
              <div className="delete-desc" style={{ whiteSpace: "pre-line" }}>
                {confirmModal.desc}
              </div>
              <div className="delete-actions">
                <button
                  className="btn btn-outline"
                  onClick={() =>
                    setConfirmModal((p) => ({
                      ...p,
                      open: false,
                      onConfirm: null,
                    }))
                  }
                >
                  Anuluj
                </button>
                <button
                  className={`btn ${
                    confirmModal.variant === "danger"
                      ? "btn-danger"
                      : "btn-primary"
                  }`}
                  onClick={() => {
                    confirmModal.onConfirm?.();
                    setConfirmModal((p) => ({
                      ...p,
                      open: false,
                      onConfirm: null,
                    }));
                  }}
                >
                  {confirmModal.label}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======== TOASTS ======== */}
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

export default PriceChanger;
