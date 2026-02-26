// frontend/src/components/admin/AllegroPanel.tsx
// Full Allegro management panel — uses admin CSS variables (not Tailwind)
import { useState, useEffect, useCallback, useMemo } from "react";

const API = import.meta.env.PUBLIC_API_URL || "http://localhost:4000";

interface AllegroOffer {
  id: string;
  name: string;
  price: number;
  stock: number;
  image: string | null;
  active: boolean;
  linkedProductId: string | null;
  linkedProductName: string | null;
  shopStock: number | null;
}

interface SyncStatus {
  connected: boolean;
  totalProducts: number;
  linkedToAllegro: number;
  zeroStockLinked: number;
}

interface ActionResult {
  type: "success" | "error" | "info";
  message: string;
}

type FilterMode = "all" | "linked" | "unlinked" | "no-stock" | "out-of-sync";
type SortField = "newest" | "name" | "price" | "stock";

const S = {
  bg: "var(--bg)",
  card: "var(--bg-card)",
  hover: "var(--bg-hover)",
  input: "var(--bg-input)",
  border: "var(--border)",
  text: "var(--text)",
  muted: "var(--text-muted)",
  primary: "var(--primary)",
  danger: "var(--danger)",
  success: "var(--success)",
  warning: "var(--warning)",
  accent: "var(--accent)",
} as const;

const PER_PAGE_OPTIONS = [20, 50, 100, 200, 500];

export default function AllegroPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [offers, setOffers] = useState<AllegroOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [offersLoading, setOffersLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sortBy, setSortBy] = useState<SortField>("newest");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(50);

  const getAuthCookie = () => {
    const match = document.cookie.match(/(?:^|; )admin_token=([^;]*)/);
    return match ? match[1] : "";
  };

  const apiFetch = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const token = getAuthCookie();
      const headers: Record<string, string> = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      if (options.body) headers["Content-Type"] = "application/json";
      return fetch(`${API}${path}`, {
        ...options,
        credentials: "include",
        headers: { ...headers, ...(options.headers as Record<string, string>) },
      });
    },
    [],
  );

  const fetchStatus = useCallback(async () => {
    try {
      const authRes = await fetch(`${API}/api/allegro/auth/status`);
      const authData = await authRes.json();
      const connected = authData.data?.isAuthenticated ?? false;
      if (connected) {
        const syncRes = await apiFetch("/api/allegro/sync-status");
        const syncData = await syncRes.json();
        setStatus(syncData.data);
      } else {
        setStatus({
          connected: false,
          totalProducts: 0,
          linkedToAllegro: 0,
          zeroStockLinked: 0,
        });
      }
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  const fetchOffers = useCallback(async () => {
    setOffersLoading(true);
    try {
      const res = await apiFetch("/api/allegro/all-offers");
      const data = await res.json();
      if (data.success) setOffers(data.data || []);
    } catch (err: any) {
      console.error("Failed to fetch offers:", err);
    } finally {
      setOffersLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);
  useEffect(() => {
    if (status?.connected) fetchOffers();
  }, [status?.connected, fetchOffers]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("allegro_connected") === "true") {
      setResult({ type: "success", message: "Pomyślnie połączono z Allegro!" });
      window.history.replaceState({}, "", window.location.pathname);
      fetchStatus();
    }
    if (params.get("allegro_error")) {
      setResult({
        type: "error",
        message: `Błąd OAuth: ${params.get("allegro_error")}`,
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [fetchStatus]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [search, filter, sortBy, sortDir, perPage]);

  // === ACTIONS ===
  const handleConnect = async () => {
    setActionLoading("connect");
    try {
      const res = await apiFetch("/api/allegro/auth/url");
      const data = await res.json();
      if (data.data?.url) window.location.href = data.data.url;
    } catch {
      setResult({ type: "error", message: "Nie udało się pobrać URL OAuth" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleImport = async () => {
    if (!confirm("Dopasować oferty Allegro do produktów sklepowych po nazwie?"))
      return;
    setActionLoading("import");
    setResult(null);
    try {
      const res = await apiFetch("/api/allegro/import", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const r = data.data;
        setResult({
          type: "success",
          message: `Import: ${r.matched} dopasowanych, ${r.skipped} pominięte${r.errors?.length > 0 ? `, ${r.errors.length} błędów` : ""}`,
        });
        fetchStatus();
        fetchOffers();
      } else {
        setResult({ type: "error", message: data.error || "Błąd importu" });
      }
    } catch (e: any) {
      setResult({ type: "error", message: e.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReconcile = async () => {
    setActionLoading("reconcile");
    setResult(null);
    try {
      const res = await apiFetch("/api/allegro/reconcile", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setResult({
          type: "success",
          message: `Rekoncyliacja: ${data.data.synced} zsynchronizowanych`,
        });
      } else {
        setResult({ type: "error", message: data.error });
      }
    } catch (e: any) {
      setResult({ type: "error", message: e.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handlePollEvents = async () => {
    setActionLoading("poll");
    setResult(null);
    try {
      const res = await apiFetch("/api/allegro/poll-events", {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        const synced = data.data.synced || 0;
        setResult({
          type: synced > 0 ? "success" : "info",
          message:
            synced > 0
              ? `Zsynchronizowano ${synced} zmian`
              : "Brak nowych zmian",
        });
        if (synced > 0) {
          fetchStatus();
          fetchOffers();
        }
      }
    } catch (e: any) {
      setResult({ type: "error", message: e.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnlink = async (offerId: string, productId: string) => {
    if (!confirm("Usunąć powiązanie z Allegro?")) return;
    try {
      const res = await apiFetch(`/api/allegro/unlink-product/${productId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setOffers((prev) =>
          prev.map((o) =>
            o.id === offerId
              ? { ...o, linkedProductId: null, linkedProductName: null }
              : o,
          ),
        );
        fetchStatus();
        setResult({ type: "success", message: "Powiązanie usunięte" });
      }
    } catch (e: any) {
      setResult({ type: "error", message: e.message });
    }
  };

  // === FILTERED, SORTED, PAGINATED ===
  const filteredSorted = useMemo(() => {
    let list = [...offers];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          o.linkedProductName?.toLowerCase().includes(q) ||
          o.id.includes(q),
      );
    }

    // Filter
    switch (filter) {
      case "linked":
        list = list.filter((o) => o.linkedProductId);
        break;
      case "unlinked":
        list = list.filter((o) => !o.linkedProductId);
        break;
      case "no-stock":
        list = list.filter((o) => o.stock === 0);
        break;
      case "out-of-sync":
        list = list.filter(
          (o) =>
            o.linkedProductId &&
            o.shopStock !== null &&
            o.shopStock !== o.stock,
        );
        break;
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "newest") {
        // Allegro IDs are numeric strings — higher = newer
        const aNum = parseInt(a.id) || 0;
        const bNum = parseInt(b.id) || 0;
        cmp = aNum - bNum;
      } else if (sortBy === "name") {
        cmp = a.name.localeCompare(b.name, "pl");
      } else if (sortBy === "price") {
        cmp = a.price - b.price;
      } else if (sortBy === "stock") {
        cmp = a.stock - b.stock;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [offers, search, filter, sortBy, sortDir]);

  const totalFiltered = filteredSorted.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / perPage));
  const currentPage = Math.min(page, totalPages - 1);
  const paginatedOffers = filteredSorted.slice(
    currentPage * perPage,
    (currentPage + 1) * perPage,
  );

  const counts = useMemo(
    () => ({
      all: offers.length,
      linked: offers.filter((o) => o.linkedProductId).length,
      unlinked: offers.filter((o) => !o.linkedProductId).length,
      noStock: offers.filter((o) => o.stock === 0).length,
      outOfSync: offers.filter(
        (o) =>
          o.linkedProductId && o.shopStock !== null && o.shopStock !== o.stock,
      ).length,
    }),
    [offers],
  );

  const toggleSort = (col: SortField) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir(col === "newest" ? "desc" : "asc");
    }
  };

  const sortArrow = (col: SortField) =>
    sortBy === col ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  // === LOADING ===
  if (loading) {
    return (
      <div
        style={{
          background: S.card,
          border: `1px solid ${S.border}`,
          borderRadius: 8,
          padding: 40,
          textAlign: "center",
          color: S.muted,
          fontSize: 14,
        }}
      >
        ⏳ Ładowanie...
      </div>
    );
  }

  const isConnected = status?.connected ?? false;

  // === NOT CONNECTED ===
  if (!isConnected) {
    return (
      <div
        style={{
          background: S.card,
          border: `1px solid ${S.border}`,
          borderRadius: 12,
          padding: 48,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>🔗</div>
        <h2
          style={{
            color: S.text,
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Allegro niepołączone
        </h2>
        <p style={{ color: S.muted, fontSize: 14, marginBottom: 24 }}>
          Połącz konto Allegro, aby zarządzać ofertami
        </p>
        <button
          className="btn btn-primary"
          onClick={handleConnect}
          disabled={actionLoading === "connect"}
        >
          {actionLoading === "connect" ? "⏳ " : "🔗 "}Połącz z Allegro
        </button>
        {result && (
          <div
            style={{
              marginTop: 16,
              padding: "8px 16px",
              borderRadius: 6,
              fontSize: 13,
              background: result.type === "error" ? "#7f1d1d" : "#166534",
              color: result.type === "error" ? "#fecaca" : "#bbf7d0",
            }}
          >
            {result.message}
          </div>
        )}
      </div>
    );
  }

  // === CONNECTED — FULL PANEL ===
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Stats bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
        }}
      >
        <StatCard
          label="Oferty Allegro"
          value={counts.all}
          bg="#1a1d27"
          accent="#8b8fa3"
        />
        <StatCard
          label="Powiązane"
          value={counts.linked}
          bg="#052e16"
          accent="#4ade80"
        />
        <StatCard
          label="Bez powiązania"
          value={counts.unlinked}
          bg="#451a03"
          accent="#fbbf24"
        />
        <StatCard
          label="Stock = 0"
          value={counts.noStock}
          bg="#450a0a"
          accent="#f87171"
        />
        <StatCard
          label="Rozbieżne stany"
          value={counts.outOfSync}
          bg="#1e1a03"
          accent="#fb923c"
        />
      </div>

      {/* Actions bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          background: S.card,
          border: `1px solid ${S.border}`,
          borderRadius: 8,
          padding: "10px 16px",
        }}
      >
        <button
          className="btn btn-outline btn-sm"
          onClick={handleImport}
          disabled={actionLoading === "import"}
        >
          {actionLoading === "import" ? "⏳" : "📥"} Import ofert
        </button>
        <button
          className="btn btn-outline btn-sm"
          onClick={handlePollEvents}
          disabled={actionLoading === "poll"}
        >
          {actionLoading === "poll" ? "⏳" : "⚡"} Pobranie zdarzeń
        </button>
        <button
          className="btn btn-outline btn-sm"
          onClick={handleReconcile}
          disabled={actionLoading === "reconcile"}
        >
          {actionLoading === "reconcile" ? "⏳" : "🔄"} Stany: Allegro → Sklep
          (powielenie w sklepie stanów z Allegro dla powiązanych produktów)
        </button>

        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: S.muted }}>Pokaż:</span>
          <select
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value))}
            style={{ padding: "4px 8px", fontSize: 12 }}
          >
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            fetchOffers();
            fetchStatus();
          }}
          disabled={offersLoading}
        >
          {offersLoading ? "⏳" : "🔃"} Odśwież
        </button>
      </div>

      {/* Result message */}
      {result && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            fontSize: 13,
            background:
              result.type === "success"
                ? "#166534"
                : result.type === "error"
                  ? "#7f1d1d"
                  : "#1e3a5f",
            color:
              result.type === "success"
                ? "#bbf7d0"
                : result.type === "error"
                  ? "#fecaca"
                  : "#93c5fd",
            border: `1px solid ${result.type === "success" ? "#22c55e33" : result.type === "error" ? "#ef444433" : "#3b82f633"}`,
          }}
        >
          {result.message}
        </div>
      )}

      {/* Search & Filter bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
          <span
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: S.muted,
              fontSize: 14,
            }}
          >
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj oferty..."
            style={{
              width: "100%",
              padding: "8px 12px 8px 36px",
              background: S.input,
              color: S.text,
              border: `1px solid ${S.border}`,
              borderRadius: 8,
              fontSize: 13,
              outline: "none",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            gap: 2,
            background: S.hover,
            borderRadius: 8,
            padding: 2,
          }}
        >
          {(
            [
              ["all", `Wszystkie (${counts.all})`],
              ["linked", `Powiązane (${counts.linked})`],
              ["unlinked", `Bez (${counts.unlinked})`],
              ["no-stock", `Stock=0 (${counts.noStock})`],
              ["out-of-sync", `Rozbieżne (${counts.outOfSync})`],
            ] as [FilterMode, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
                background: filter === key ? S.card : "transparent",
                color: filter === key ? S.text : S.muted,
                transition: "all .15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Offers table */}
      <div className="admin-table-wrap">
        {offersLoading ? (
          <div
            style={{
              textAlign: "center",
              padding: 48,
              color: S.muted,
              fontSize: 14,
            }}
          >
            ⏳ Pobieranie ofert z Allegro...
          </div>
        ) : paginatedOffers.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: S.muted }}>
            <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>
              📦
            </div>
            <span style={{ fontSize: 13 }}>Brak ofert</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th
                  onClick={() => toggleSort("newest")}
                  style={{ cursor: "pointer", width: 50 }}
                >
                  ID{sortArrow("newest")}
                </th>
                <th style={{ width: 50 }}></th>
                <th
                  onClick={() => toggleSort("name")}
                  style={{ cursor: "pointer" }}
                >
                  Oferta{sortArrow("name")}
                </th>
                <th
                  onClick={() => toggleSort("price")}
                  style={{ cursor: "pointer", textAlign: "right", width: 120 }}
                >
                  Cena{sortArrow("price")}
                </th>
                <th
                  onClick={() => toggleSort("stock")}
                  style={{ cursor: "pointer", textAlign: "right", width: 80 }}
                >
                  Stock{sortArrow("stock")}
                </th>
                <th style={{ width: 110, textAlign: "center" }}>
                  Sklep↔Allegro
                </th>
                <th style={{ width: 250 }}>Powiązanie</th>
                <th style={{ width: 80, textAlign: "center" }}>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {paginatedOffers.map((offer, idx) => (
                <tr
                  key={offer.id}
                  style={{ opacity: offer.stock === 0 ? 0.5 : 1 }}
                >
                  {/* Row number */}
                  <td
                    style={{
                      color: S.muted,
                      fontSize: 11,
                      textAlign: "center",
                    }}
                  >
                    {currentPage * perPage + idx + 1}
                  </td>

                  {/* Allegro ID (short) */}
                  <td
                    style={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      color: S.muted,
                      maxWidth: 60,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {offer.id}
                  </td>

                  {/* Image */}
                  <td>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 4,
                        background: S.hover,
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {offer.image ? (
                        <img
                          src={offer.image}
                          alt=""
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                          }}
                          loading="lazy"
                        />
                      ) : (
                        <span style={{ fontSize: 16, opacity: 0.3 }}>📷</span>
                      )}
                    </div>
                  </td>

                  {/* Name */}
                  <td>
                    <a
                      href={`https://allegro.pl/oferta/${offer.id}`}
                      target="_blank"
                      rel="noopener"
                      style={{
                        color: S.text,
                        fontWeight: 500,
                        textDecoration: "none",
                        fontSize: 13,
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 500,
                      }}
                      title={offer.name}
                    >
                      {offer.name}
                    </a>
                  </td>

                  {/* Price */}
                  <td
                    style={{
                      textAlign: "right",
                      fontWeight: 600,
                      color: S.text,
                      whiteSpace: "nowrap",
                      fontSize: 13,
                    }}
                  >
                    {offer.price.toLocaleString("pl-PL", {
                      minimumFractionDigits: 2,
                    })}{" "}
                    zł
                  </td>

                  {/* Stock */}
                  <td style={{ textAlign: "right" }}>
                    <span
                      className={`badge ${offer.stock > 0 ? "badge-green" : "badge-red"}`}
                    >
                      {offer.stock}
                    </span>
                  </td>
                  {/* Stock comparison */}
                  <td style={{ textAlign: "center" }}>
                    {offer.linkedProductId && offer.shopStock !== null ? (
                      offer.shopStock === offer.stock ? (
                        <span
                          style={{ color: "#4ade80", fontSize: 14 }}
                          title={`Sklep: ${offer.shopStock} | Allegro: ${offer.stock}`}
                        >
                          ✓
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color:
                              offer.shopStock > offer.stock
                                ? "#fbbf24"
                                : "#f87171",
                            background:
                              offer.shopStock > offer.stock
                                ? "#451a0322"
                                : "#450a0a22",
                            padding: "2px 8px",
                            borderRadius: 4,
                          }}
                          title={`Sklep: ${offer.shopStock} | Allegro: ${offer.stock}`}
                        >
                          {offer.shopStock > offer.stock ? "+" : ""}
                          {offer.shopStock - offer.stock}
                        </span>
                      )
                    ) : (
                      <span style={{ color: S.muted, fontSize: 11 }}>—</span>
                    )}
                  </td>
                  {/* Link status */}
                  <td>
                    {offer.linkedProductId ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span style={{ color: S.success, fontSize: 12 }}>
                          🔗
                        </span>
                        <a
                          href={`/admin/products?search=${encodeURIComponent(offer.linkedProductName || "")}`}
                          style={{
                            fontSize: 12,
                            color: "#4ade80",
                            textDecoration: "none",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 200,
                            display: "block",
                          }}
                          title={offer.linkedProductName || ""}
                        >
                          {offer.linkedProductName || offer.linkedProductId}
                        </a>
                      </div>
                    ) : (
                      <span
                        style={{
                          fontSize: 12,
                          color: S.muted,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        ⛓️‍💥 Brak powiązania
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td style={{ textAlign: "center" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                      }}
                    >
                      <a
                        href={`https://allegro.pl/oferta/${offer.id}`}
                        target="_blank"
                        rel="noopener"
                        className="btn btn-ghost btn-sm"
                        title="Otwórz na Allegro"
                        style={{ padding: "4px 6px", fontSize: 12 }}
                      >
                        ↗️
                      </a>
                      {offer.linkedProductId && (
                        <button
                          onClick={() =>
                            handleUnlink(offer.id, offer.linkedProductId!)
                          }
                          className="btn btn-ghost btn-sm"
                          title="Odepnij"
                          style={{
                            padding: "4px 6px",
                            fontSize: 12,
                            color: S.danger,
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalFiltered > 0 && (
        <div className="pagination">
          <button
            className="btn btn-outline btn-sm"
            disabled={currentPage === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Poprzednia
          </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: S.muted,
            }}
          >
            {/* Page number buttons */}
            {(() => {
              const pages: number[] = [];
              const start = Math.max(0, currentPage - 2);
              const end = Math.min(totalPages - 1, currentPage + 2);
              if (start > 0) pages.push(0);
              if (start > 1) pages.push(-1); // ellipsis
              for (let i = start; i <= end; i++) pages.push(i);
              if (end < totalPages - 2) pages.push(-2); // ellipsis
              if (end < totalPages - 1) pages.push(totalPages - 1);
              return pages.map((p, idx) =>
                p < 0 ? (
                  <span key={`e${idx}`} style={{ color: S.muted }}>
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      background: p === currentPage ? S.primary : "transparent",
                      color: p === currentPage ? "#fff" : S.muted,
                      transition: "all .15s",
                    }}
                  >
                    {p + 1}
                  </button>
                ),
              );
            })()}

            <span style={{ marginLeft: 8 }}>({totalFiltered} ofert)</span>
          </div>

          <button
            className="btn btn-outline btn-sm"
            disabled={currentPage >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Następna →
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  bg,
  accent,
}: {
  label: string;
  value: number;
  bg: string;
  accent: string;
}) {
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${accent}22`,
        borderRadius: 8,
        padding: "12px 16px",
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 700, color: accent }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: accent, opacity: 0.7, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}
