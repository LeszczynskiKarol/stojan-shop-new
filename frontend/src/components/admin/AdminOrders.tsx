// frontend/src/components/admin/AdminOrders.tsx
// Port 1:1 ze starego Next.js admin/orders/page.tsx
// Bez: zustand, shadcn/ui, framer-motion → czysty React + fetch
import { CourierSelectModal } from "./CourierSelectModal";
import { useEffect, useState, useCallback } from "react";
import { OrderDetailsDialog } from "./OrderDetailsDialog";
import { CancelOrderModal } from "./CancelOrderModal";

const API = (import.meta as any).env?.PUBLIC_API_URL || "http://localhost:4000";

// ============================================
// Types (exported for child components)
// ============================================
interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  mainImage?: string;
  weight?: number;
  slug?: string;
  categorySlug?: string;
}

interface OrderShipping {
  firstName?: string;
  lastName?: string;
  companyName?: string;
  nip?: string;
  email: string;
  phone: string;
  street: string;
  postalCode: string;
  city: string;
  differentShippingAddress?: boolean;
  shippingStreet?: string;
  shippingPostalCode?: string;
  shippingCity?: string;
  notes?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  items: OrderItem[];
  shipping: OrderShipping;
  subtotal: number;
  shippingCost: number;
  total: number;
  totalWeight: number;
  status: "pending" | "paid" | "shipped" | "delivered" | "cancelled";
  paymentMethod: "prepaid" | "cod";
  paymentDetails?: any;
  isStockReserved: boolean;
  stripeSessionId?: string;
  invoiceUrls?: string[];
  cancellationReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  createdAt: string;
  updatedAt: string;
}

type SortField = "createdAt" | "orderNumber" | "total" | "status";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500 text-white",
  paid: "bg-green-500 text-white",
  shipped: "bg-blue-500 text-white",
  delivered: "bg-purple-500 text-white",
  cancelled: "bg-red-500 text-white",
};

const statusLabels: Record<string, string> = {
  pending: "Oczekujące",
  paid: "Opłacone",
  shipped: "Wysłane",
  delivered: "Dostarczone",
  cancelled: "Anulowane",
};

const fmt = (v: number) =>
  Number(v).toLocaleString("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

function FedExShipButton({
  order,
  onShipped,
}: {
  order: Order;
  onShipped: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [price, setPrice] = useState<string | null>(null);
  const weight = Number(order.totalWeight) || 0;

  useEffect(() => {
    const s = order.shipping as any;
    const pc = s.differentShippingAddress
      ? s.shippingPostalCode || s.postalCode
      : s.postalCode;
    const city = s.differentShippingAddress ? s.shippingCity || s.city : s.city;
    fetch(`${API}/api/admin/fedex/price`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ weightKg: weight, postalCode: pc, city }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data.rates?.length) {
          const r = json.data.rates[0];
          setPrice(`${Number(r.totalCharge).toFixed(0)} ${r.currency}`);
        }
      })
      .catch(() => {});
  }, [order.id]);

  return (
    <button
      onClick={async () => {
        if (
          !confirm(
            `Nadać FedEx #${order.orderNumber}?\nWaga: ${weight} kg${price ? `\nCena: ~${price}` : ""}`,
          )
        )
          return;
        setLoading(true);
        try {
          await fetch(`${API}/api/orders/${order.id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "shipped" }),
          });
          onShipped();
        } catch {
          alert("Błąd");
          setLoading(false);
        }
      }}
      disabled={loading}
      className="px-2 py-1 rounded bg-blue-600 text-white text-xs whitespace-nowrap"
    >
      {loading ? "⏳..." : `📦 FedEx ${weight}kg${price ? ` ~${price}` : ""}`}
    </button>
  );
}

// ============================================
// Component
// ============================================
export function AdminOrders() {
  const [wnModal, setWnModal] = useState<{
    order: Order;
    offers: any[];
  } | null>(null);
  const [wnLoading, setWnLoading] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("ordersPerPage");
      return saved ? parseInt(saved) : 20;
    }
    return 20;
  });

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [hidePending, setHidePending] = useState(true);
  const [hideCancelled, setHideCancelled] = useState(true);
  const [sort, setSort] = useState<{
    field: SortField;
    direction: "asc" | "desc";
  }>({
    field: "createdAt",
    direction: "desc",
  });

  // Modals
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<string | null>(null);
  const [ordersToCancel, setOrdersToCancel] = useState<string[]>([]);
  const [showCancellationReason, setShowCancellationReason] = useState<
    string | null
  >(null);

  // Invoice upload loading state
  const [uploadingInvoice, setUploadingInvoice] = useState<string | null>(null);

  // Marked orders (persist in localStorage like old version)
  const [markedOrders, setMarkedOrders] = useState<Order[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("markedOrdersData");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  // Toast
  const [toast, setToast] = useState<{
    msg: string;
    type: "ok" | "err";
  } | null>(null);
  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Persist marked orders
  useEffect(() => {
    localStorage.setItem("markedOrdersData", JSON.stringify(markedOrders));
  }, [markedOrders]);

  // Persist items per page
  useEffect(() => {
    localStorage.setItem("ordersPerPage", itemsPerPage.toString());
  }, [itemsPerPage]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // ── FETCH ──
  const fetchOrders = useCallback(
    async (page = currentPage) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(itemsPerPage),
          hidePending: String(hidePending),
          hideCancelled: String(hideCancelled),
          sortField: sort.field,
          sortDirection: sort.direction,
        });
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (debouncedSearch) params.set("search", debouncedSearch);

        const res = await fetch(`${API}/api/orders?${params}`);
        const json = await res.json();
        if (json.success) {
          const d = json.data;
          setOrders(d.orders || []);
          setCurrentPage(d.currentPage ?? page);
          setTotalPages(d.totalPages ?? 1);
          setTotal(d.total ?? 0);
        }
      } catch (err) {
        console.error("Fetch orders error:", err);
        showToast("Błąd pobierania zamówień", "err");
      } finally {
        setLoading(false);
      }
    },
    [
      itemsPerPage,
      hidePending,
      hideCancelled,
      statusFilter,
      debouncedSearch,
      sort,
    ],
  );

  useEffect(() => {
    fetchOrders(0);
  }, [fetchOrders]);

  // ── HANDLERS ──
  const handleSort = (field: SortField) => {
    setSort((prev) => ({
      field,
      direction:
        prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    if (
      newStatus === "shipped" &&
      !confirm("Czy na pewno oznaczyć jako wysłane?")
    )
      return;
    try {
      await fetch(`${API}/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchOrders();
      showToast("Status zaktualizowany");
    } catch {
      showToast("Błąd aktualizacji statusu", "err");
    }
  };

  const confirmCancellation = async (reason: string) => {
    try {
      if (orderToCancel) {
        await fetch(`${API}/api/orders/${orderToCancel}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason, cancelledBy: "admin" }),
        });
        showToast("Zamówienie anulowane");
      } else if (ordersToCancel.length > 0) {
        await fetch(`${API}/api/orders/cancel-multiple`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: ordersToCancel,
            reason,
            cancelledBy: "admin",
          }),
        });
        setMarkedOrders([]);
        showToast(`Anulowano ${ordersToCancel.length} zamówień`);
      }
      fetchOrders();
    } catch {
      showToast("Błąd anulowania", "err");
    } finally {
      setCancelModalOpen(false);
      setOrderToCancel(null);
      setOrdersToCancel([]);
    }
  };

  const handleDeleteOrder = async (id: string) => {
    if (!confirm("Czy na pewno chcesz usunąć to zamówienie?")) return;
    try {
      await fetch(`${API}/api/orders/${id}`, { method: "DELETE" });
      fetchOrders();
      showToast("Zamówienie usunięte");
    } catch {
      showToast("Błąd usuwania", "err");
    }
  };

  const handleDeleteMultiple = async () => {
    if (!markedOrders.length) return;
    if (!confirm(`Usunąć ${markedOrders.length} zamówień?`)) return;
    try {
      await fetch(`${API}/api/orders/delete-multiple`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: markedOrders.map((o) => o.id) }),
      });
      setMarkedOrders([]);
      fetchOrders();
      showToast(`Usunięto ${markedOrders.length} zamówień`);
    } catch {
      showToast("Błąd usuwania", "err");
    }
  };

  const handleCancelMultiple = () => {
    const toCancel = markedOrders.filter((o) => o.status !== "cancelled");
    if (!toCancel.length)
      return showToast("Wszystkie zaznaczone już anulowane", "err");
    setOrdersToCancel(toCancel.map((o) => o.id));
    setCancelModalOpen(true);
  };

  const handleExportCSV = () => {
    const header = "Numer,Status,Wartość,Klient,Produkt\n";
    const csv =
      header +
      markedOrders
        .map(
          (o) =>
            `${o.orderNumber},${o.status},${o.total},"${o.shipping.firstName} ${o.shipping.lastName}","${o.items[0]?.name}"`,
        )
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zaznaczone-zamowienia-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    showToast("Wyeksportowano CSV");
  };

  const handleProductClick = (item: OrderItem) => {
    if (item.categorySlug && item.slug) {
      window.open(`/${item.categorySlug}/${item.slug}`, "_blank");
    }
  };

  // ── INVOICE UPLOAD / REMOVE ──
  const uploadInvoice = async (orderId: string, files: FileList) => {
    setUploadingInvoice(orderId);
    try {
      // Single request: upload files + update order invoiceUrls
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append("file", f));

      const res = await fetch(`${API}/api/orders/${orderId}/upload-invoice`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      // Update local state with new invoiceUrls from response
      const updatedUrls = json.data.invoiceUrls as string[];
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, invoiceUrls: updatedUrls } : o,
        ),
      );

      showToast(`Dodano ${json.data.urls.length} faktur(ę)`);
    } catch (err: any) {
      showToast(err.message || "Błąd uploadu faktury", "err");
    } finally {
      setUploadingInvoice(null);
    }
  };

  const removeInvoice = async (orderId: string, urlIndex: number) => {
    if (!confirm("Usunąć tę fakturę?")) return;
    try {
      const order = orders.find((o) => o.id === orderId);
      const currentUrls: string[] = order?.invoiceUrls || [];
      const updatedUrls = currentUrls.filter((_, i) => i !== urlIndex);

      const res = await fetch(`${API}/api/orders/${orderId}/invoices`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceUrls: updatedUrls }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, invoiceUrls: updatedUrls } : o,
        ),
      );
      showToast("Faktura usunięta");
    } catch (err: any) {
      showToast(err.message || "Błąd usuwania faktury", "err");
    }
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="space-y-4 p-4">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-lg shadow-lg text-white text-sm ${
            toast.type === "ok" ? "bg-green-600" : "bg-red-600"
          }`}
          style={{ animation: "fadeIn .2s ease" }}
        >
          {toast.msg}
        </div>
      )}

      <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">
        Zarządzanie zamówieniami
      </h2>

      {/* ═══════════ FILTERS ═══════════ */}
      <div className="flex gap-3 flex-wrap items-center">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Szukaj..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-3 h-9 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 w-56"
          />
          <svg
            className="absolute left-3 top-2.5 w-4 h-4 text-[hsl(var(--muted-foreground))]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>

        {/* Status select */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
        >
          <option value="all">Wszystkie statusy</option>
          {Object.entries(statusLabels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>

        {/* Toggle pending */}
        <button
          onClick={() => setHidePending(!hidePending)}
          className={`h-9 px-3 rounded-lg border text-sm transition-colors ${
            !hidePending
              ? "bg-yellow-100 dark:bg-yellow-900 border-yellow-300"
              : "border-[hsl(var(--border))]"
          }`}
        >
          {hidePending ? "Pokaż oczekujące" : "Ukryj oczekujące"}
        </button>

        {/* Toggle cancelled */}
        <button
          onClick={() => setHideCancelled(!hideCancelled)}
          className={`h-9 px-3 rounded-lg border text-sm transition-colors ${
            !hideCancelled
              ? "bg-red-100 dark:bg-red-900 border-red-300"
              : "border-[hsl(var(--border))]"
          }`}
        >
          {hideCancelled ? "Pokaż anulowane" : "Ukryj anulowane"}
        </button>
        {/* FedEx Pickup */}
        <FedExPickupButton />
        {/* DHL Pickup */}
        <DHLPickupButton />
        {/* Bulk actions */}
        {markedOrders.length > 0 && (
          <>
            <button
              onClick={handleDeleteMultiple}
              className="h-9 px-3 rounded-lg bg-red-600 text-white text-sm font-medium"
            >
              🗑 Usuń zaznaczone ({markedOrders.length})
            </button>
            <button
              onClick={handleCancelMultiple}
              className="h-9 px-3 rounded-lg bg-orange-600 text-white text-sm font-medium"
            >
              ✕ Anuluj zaznaczone ({markedOrders.length})
            </button>
            <button
              onClick={handleExportCSV}
              className="h-9 px-3 rounded-lg border border-[hsl(var(--border))] text-sm"
            >
              📤 Eksportuj CSV
            </button>
          </>
        )}

        {/* Items per page */}
        <select
          value={itemsPerPage}
          onChange={(e) => setItemsPerPage(Number(e.target.value))}
          className="h-9 px-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm"
        >
          {[20, 50, 100, 200].map((n) => (
            <option key={n} value={n}>
              {n} zamówień
            </option>
          ))}
        </select>

        {/* Refresh */}
        <button
          onClick={() => fetchOrders()}
          className="h-9 px-4 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-medium"
        >
          Odśwież
        </button>
      </div>

      {/* Info bar */}
      <div className="bg-[hsl(var(--accent))]/50 rounded-lg p-3 flex items-center justify-between text-sm">
        <span>
          Znaleziono <strong>{total}</strong> zamówień
        </span>
        <span className="text-[hsl(var(--muted-foreground))]">
          Strona {currentPage + 1} z {totalPages} ({orders.length} na tej
          stronie)
        </span>
      </div>

      {/* ═══════════ TABLE ═══════════ */}
      <div className="border border-[hsl(var(--border))] rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[hsl(var(--accent))]">
            <tr>
              <th className="px-3 py-2 text-left w-10">Lp.</th>
              <th className="px-3 py-2 text-left w-10">
                <input
                  type="checkbox"
                  checked={
                    orders.length > 0 && markedOrders.length === orders.length
                  }
                  onChange={(e) =>
                    setMarkedOrders(e.target.checked ? [...orders] : [])
                  }
                  className="w-4 h-4"
                />
              </th>
              {(
                [
                  ["orderNumber", "Numer"],
                  ["createdAt", "Data"],
                  ["", "Zamówienie"],
                  ["status", "Status"],
                  ["total", "Wartość"],
                ] as [string, string][]
              ).map(([field, label]) => (
                <th
                  key={label}
                  className={`px-3 py-2 text-left ${field ? "cursor-pointer hover:bg-[hsl(var(--accent))]/80" : ""}`}
                  onClick={() => field && handleSort(field as SortField)}
                >
                  <span className="flex items-center gap-1">
                    {label}
                    {field && sort.field === field && (
                      <span className="text-[hsl(var(--primary))]">
                        {sort.direction === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2 text-left">Faktury</th>
              <th className="px-3 py-2 text-left">Szczegóły</th>
              <th className="px-3 py-2 text-left">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-8 text-center text-[hsl(var(--muted-foreground))]"
                >
                  Ładowanie...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-8 text-center text-[hsl(var(--muted-foreground))]"
                >
                  Brak zamówień
                </td>
              </tr>
            ) : (
              orders.map((order, index) => (
                <tr
                  key={order.id}
                  className={`border-t border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]/30 transition-colors ${
                    markedOrders.some((o) => o.id === order.id)
                      ? "bg-[hsl(var(--accent))]/50"
                      : ""
                  }`}
                >
                  {/* Lp */}
                  <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">
                    {index + 1 + currentPage * itemsPerPage}
                  </td>

                  {/* Checkbox */}
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={markedOrders.some((o) => o.id === order.id)}
                      onChange={(e) => {
                        setMarkedOrders(
                          e.target.checked
                            ? [...markedOrders, order]
                            : markedOrders.filter((o) => o.id !== order.id),
                        );
                      }}
                      className="w-4 h-4"
                    />
                  </td>

                  {/* Order number */}
                  <td className="px-3 py-2 font-medium">{order.orderNumber}</td>

                  {/* Date */}
                  <td className="px-3 py-2 text-[hsl(var(--muted-foreground))]">
                    {new Date(order.createdAt).toLocaleString("pl")}
                  </td>

                  {/* Order details (product preview + hover cloud) */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 relative group">
                      {(order.items[0]?.mainImage || order.items[0]?.image) && (
                        <img
                          src={
                            order.items[0]?.mainImage || order.items[0]?.image
                          }
                          alt="Produkt"
                          className="w-12 h-12 object-cover rounded border cursor-pointer"
                          onClick={() => handleProductClick(order.items[0])}
                        />
                      )}
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {order.items[0]?.name}
                            {order.items.length > 1 && (
                              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                                {" "}
                                +{order.items.length - 1}
                              </span>
                            )}
                          </span>
                          {order.paymentMethod === "cod" && (
                            <span
                              className="bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]"
                              title="Płatność za pobraniem"
                            >
                              🚚
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">
                          Ilość:{" "}
                          {order.items.reduce((s, i) => s + i.quantity, 0)}
                        </span>
                      </div>

                      {/* ── HOVER CLOUD ── */}
                      <div
                        className="fixed z-[9999] invisible group-hover:visible p-4 rounded-lg shadow-2xl border border-[hsl(var(--border))] min-w-[540px] max-w-[600px] max-h-[80vh] overflow-y-auto left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none group-hover:pointer-events-auto"
                        style={{ background: "var(--bg-card, #1a1d27)" }}
                      >
                        {" "}
                        <div className="space-y-4">
                          {/* Products */}
                          <div>
                            <h4 className="font-semibold mb-3">
                              Zamówione produkty
                            </h4>
                            {order.items.map((item, idx) => (
                              <div
                                key={idx}
                                className="border border-[hsl(var(--border))] rounded-lg p-3 mb-2"
                              >
                                <div className="flex gap-3">
                                  {(item.mainImage || item.image) && (
                                    <img
                                      src={item.mainImage || item.image}
                                      alt={item.name}
                                      className="w-20 h-20 object-cover rounded cursor-pointer"
                                      onClick={() => handleProductClick(item)}
                                    />
                                  )}
                                  <div className="flex-1">
                                    <h5 className="font-medium text-sm">
                                      {item.name}
                                    </h5>
                                    <div className="grid grid-cols-2 gap-1 mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                                      <span>Ilość: {item.quantity}</span>
                                      <span>Cena: {fmt(item.price)}</span>
                                      {item.weight && (
                                        <span>Waga: {item.weight} kg</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Client & shipping grid */}
                          <div className="grid grid-cols-2 gap-4">
                            {/* Client data */}
                            <div className="border border-[hsl(var(--border))] rounded-lg p-3">
                              <h4 className="font-semibold mb-2 text-xs flex items-center gap-1">
                                💳{" "}
                                {order.shipping.nip
                                  ? "FAKTURA VAT"
                                  : "DANE KLIENTA"}
                              </h4>
                              <div className="text-xs space-y-1">
                                <div className="font-medium">
                                  {order.shipping.companyName ||
                                    `${order.shipping.firstName} ${order.shipping.lastName}`}
                                </div>
                                {order.shipping.nip && (
                                  <div className="text-red-600 font-medium">
                                    NIP: {order.shipping.nip}
                                  </div>
                                )}
                                <div>{order.shipping.street}</div>
                                <div>
                                  {order.shipping.postalCode}{" "}
                                  {order.shipping.city}
                                </div>
                                <div className="pt-1 border-t border-[hsl(var(--border))] mt-1">
                                  <div>Tel: {order.shipping.phone}</div>
                                  <div>Email: {order.shipping.email}</div>
                                </div>
                              </div>
                            </div>

                            {/* Shipping address */}
                            <div className="border border-[hsl(var(--border))] rounded-lg p-3">
                              <h4 className="font-semibold mb-2 text-xs flex items-center gap-1">
                                🚚 ADRES DOSTAWY
                              </h4>
                              <div className="text-xs space-y-1">
                                <div className="font-medium">
                                  {order.shipping.firstName}{" "}
                                  {order.shipping.lastName}
                                </div>
                                <div>
                                  {order.shipping.differentShippingAddress
                                    ? order.shipping.shippingStreet
                                    : order.shipping.street}
                                </div>
                                <div>
                                  {order.shipping.differentShippingAddress
                                    ? order.shipping.shippingPostalCode
                                    : order.shipping.postalCode}{" "}
                                  {order.shipping.differentShippingAddress
                                    ? order.shipping.shippingCity
                                    : order.shipping.city}
                                </div>
                                <div className="pt-1 border-t border-[hsl(var(--border))] mt-1">
                                  <div>Tel: {order.shipping.phone}</div>
                                  <div>Email: {order.shipping.email}</div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Payment & totals */}
                          <div className="border-t border-[hsl(var(--border))] pt-2 text-xs">
                            <div className="flex justify-between">
                              <span>
                                Płatność:{" "}
                                {order.paymentMethod === "prepaid"
                                  ? "Online"
                                  : "Pobranie"}
                                {" • "}Wysyłka: {fmt(order.shippingCost)}
                              </span>
                              <span className="font-bold">
                                Suma: {fmt(order.total)}
                              </span>
                            </div>
                          </div>

                          {/* Notes */}
                          {order.shipping.notes && (
                            <div className="border border-yellow-200 dark:border-yellow-800 rounded-lg p-2 bg-yellow-50 dark:bg-yellow-900/20">
                              <div className="text-xs">
                                <strong>💬 Uwagi:</strong>{" "}
                                {order.shipping.notes}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          order.paymentMethod === "cod" &&
                          order.status === "paid"
                            ? "bg-red-100 text-red-700"
                            : statusColors[order.status]
                        }`}
                      >
                        {order.paymentMethod === "cod" &&
                        order.status === "paid"
                          ? "Pobranie"
                          : statusLabels[order.status]}
                      </span>
                      {(order.paymentDetails as any)?.fedex?.trackingNumber && (
                        <a
                          href={`https://www.fedex.com/fedextrack/?trknbr=${(order.paymentDetails as any).fedex.trackingNumber}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-blue-400 hover:text-blue-300 hover:underline"
                          title="Śledź przesyłkę FedEx"
                        >
                          📦{" "}
                          {(order.paymentDetails as any).fedex.trackingNumber}
                        </a>
                      )}
                      {(order.paymentDetails as any)?.dhl?.trackingNumber && (
                        <a
                          href={`https://www.dhl.com/pl-pl/home/sledzenie.html?tracking-id=${(order.paymentDetails as any).dhl.trackingNumber}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-yellow-400 hover:text-yellow-300 hover:underline"
                        >
                          📦 DHL{" "}
                          {(order.paymentDetails as any).dhl.trackingNumber}
                        </a>
                      )}
                      {(order.paymentDetails as any)?.wysylajnami
                        ?.waybillNumber && (
                        <a
                          href={
                            (order.paymentDetails as any).wysylajnami
                              .trackingUrl || "#"
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-green-400 hover:text-green-300 hover:underline"
                        >
                          🚛 WN{" "}
                          {
                            (order.paymentDetails as any).wysylajnami
                              .waybillNumber
                          }
                        </a>
                      )}
                    </div>
                  </td>

                  {/* Total */}
                  <td className="px-3 py-2 font-medium">{fmt(order.total)}</td>

                  {/* ═══ INVOICES COLUMN (NEW) ═══ */}
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1 min-w-[140px]">
                      {/* FedEx label */}
                      {/* FedEx label + cancel */}
                      {(order.paymentDetails as any)?.fedex?.trackingNumber && (
                        <div className="flex items-center gap-1.5">
                          {(order.paymentDetails as any)?.fedex?.labelUrl && (
                            <a
                              href={
                                (order.paymentDetails as any).fedex.labelUrl
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
                            >
                              🏷️ Etykieta
                            </a>
                          )}
                          <button
                            onClick={async () => {
                              if (
                                !confirm(
                                  `Anulować przesyłkę FedEx ${(order.paymentDetails as any).fedex.trackingNumber}?`,
                                )
                              )
                                return;
                              try {
                                const res = await fetch(
                                  `${API}/api/admin/fedex/ship/${order.id}`,
                                  { method: "DELETE", credentials: "include" },
                                );
                                const json = await res.json();
                                if (json.success) {
                                  showToast("Przesyłka FedEx anulowana");
                                  fetchOrders();
                                } else {
                                  showToast(
                                    json.error || "Błąd anulowania",
                                    "err",
                                  );
                                }
                              } catch {
                                showToast("Błąd anulowania FedEx", "err");
                              }
                            }}
                            className="text-[10px] text-red-400 hover:text-red-600 hover:underline"
                          >
                            ✕ Anuluj FedEx
                          </button>
                        </div>
                      )}
                      {(order.paymentDetails as any)?.dhl?.trackingNumber && (
                        <div className="flex items-center gap-1.5">
                          {(order.paymentDetails as any)?.dhl?.labelUrl && (
                            <a
                              href={(order.paymentDetails as any).dhl.labelUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-yellow-500 hover:text-yellow-700 hover:underline"
                            >
                              🏷️ Etykieta DHL
                            </a>
                          )}
                          <button
                            onClick={async () => {
                              if (!confirm("Anulować przesyłkę DHL?")) return;
                              try {
                                const res = await fetch(
                                  `${API}/api/admin/dhl/ship/${order.id}`,
                                  { method: "DELETE", credentials: "include" },
                                );
                                const json = await res.json();
                                if (json.success) {
                                  showToast("Przesyłka DHL anulowana");
                                  fetchOrders();
                                } else {
                                  showToast(json.error || "Błąd", "err");
                                }
                              } catch {
                                showToast("Błąd anulowania DHL", "err");
                              }
                            }}
                            className="text-[10px] text-red-400 hover:text-red-600 hover:underline"
                          >
                            ✕ Anuluj DHL
                          </button>
                        </div>
                      )}
                      {(order.paymentDetails as any)?.wysylajnami?.orderId && (
                        <div className="flex items-center gap-1.5">
                          {(order.paymentDetails as any)?.wysylajnami
                            ?.labelUrl && (
                            <a
                              href={
                                (order.paymentDetails as any).wysylajnami
                                  .labelUrl
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-green-500 hover:text-green-700 hover:underline"
                            >
                              🏷️ Etykieta WN
                            </a>
                          )}
                          <button
                            onClick={async () => {
                              if (!confirm("Anulować przesyłkę Wysylajnami?"))
                                return;
                              try {
                                const res = await fetch(
                                  `${API}/api/admin/wysylajnami/ship/${order.id}`,
                                  { method: "DELETE", credentials: "include" },
                                );
                                const json = await res.json();
                                if (json.success) {
                                  showToast("Wysylajnami anulowane");
                                  fetchOrders();
                                } else showToast(json.error || "Błąd", "err");
                              } catch {
                                showToast("Błąd anulowania WN", "err");
                              }
                            }}
                            className="text-[10px] text-red-400 hover:text-red-600 hover:underline"
                          >
                            ✕ Anuluj WN
                          </button>
                        </div>
                      )}
                      {/* Existing invoices */}
                      {(order.invoiceUrls || []).map((url, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:text-blue-700 hover:underline flex items-center gap-1"
                          >
                            📄 Faktura {i + 1}
                          </a>
                          <button
                            onClick={() => removeInvoice(order.id, i)}
                            className="text-[10px] text-red-400 hover:text-red-600 p-0 leading-none"
                            title="Usuń fakturę"
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                      {/* Upload button */}
                      <label
                        className={`inline-flex items-center gap-1 text-xs cursor-pointer mt-0.5 ${
                          uploadingInvoice === order.id
                            ? "text-[hsl(var(--muted-foreground))] pointer-events-none"
                            : "text-[hsl(var(--primary))] hover:underline"
                        }`}
                      >
                        {uploadingInvoice === order.id ? (
                          "⏳ Wysyłanie..."
                        ) : (
                          <>
                            + Dodaj fakturę
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.txt,.csv"
                              multiple
                              hidden
                              onChange={(e) => {
                                if (e.target.files?.length) {
                                  uploadInvoice(order.id, e.target.files);
                                  e.target.value = "";
                                }
                              }}
                            />
                          </>
                        )}
                      </label>
                    </div>
                  </td>

                  {/* Details button */}
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="px-2 py-1 rounded border border-[hsl(var(--border))] text-xs hover:bg-[hsl(var(--accent))] transition-colors"
                      >
                        Szczegóły
                      </button>
                      {order.status === "paid" &&
                        Number(order.totalWeight) <= 36.5 && (
                          <>
                            <FedExShipButton
                              order={order}
                              onShipped={() => fetchOrders()}
                            />
                            <button
                              onClick={async () => {
                                if (
                                  !confirm(
                                    `Wysłać ręcznie #${order.orderNumber} BEZ FedEx API?`,
                                  )
                                )
                                  return;
                                try {
                                  await fetch(
                                    `${API}/api/orders/${order.id}/status`,
                                    {
                                      method: "PATCH",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        status: "shipped",
                                        skipCourier: true,
                                      }),
                                    },
                                  );
                                  fetchOrders();
                                  showToast("Wysłane (ręcznie)");
                                } catch {
                                  showToast("Błąd", "err");
                                }
                              }}
                              className="px-2 py-1 rounded bg-gray-600 text-white text-xs"
                            >
                              🚚 Ręcznie
                            </button>
                          </>
                        )}
                      {order.status === "paid" &&
                        Number(order.totalWeight) > 36.5 && (
                          <>
                            <button
                              onClick={() =>
                                handleStatusChange(order.id, "shipped")
                              }
                              className="px-2 py-1 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs"
                            >
                              Zakończ bez API
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const s = order.shipping as any;
                                  const pc = s.differentShippingAddress
                                    ? s.shippingPostalCode || s.postalCode
                                    : s.postalCode;
                                  const city = s.differentShippingAddress
                                    ? s.shippingCity || s.city
                                    : s.city;
                                  const priceRes = await fetch(
                                    `${API}/api/admin/dhl/price`,
                                    {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      credentials: "include",
                                      body: JSON.stringify({
                                        weightKg: order.totalWeight,
                                        postalCode: pc,
                                        city,
                                        insuranceValue: order.total,
                                      }),
                                    },
                                  );
                                  const priceJson = await priceRes.json();
                                  let msg = "Nadać przesyłkę DHL?\n\n";
                                  if (priceJson.success) {
                                    msg += `Cena: ${priceJson.data.price} PLN`;
                                    if (priceJson.data.fuelSurcharge > 0)
                                      msg += ` (+ dopłata: ${priceJson.data.fuelSurcharge} PLN)`;
                                    msg += `\nWaga: ${order.totalWeight} kg`;
                                  } else {
                                    msg += `(Brak ceny)\nWaga: ${order.totalWeight} kg`;
                                  }
                                  if (!confirm(msg)) return;
                                  const res = await fetch(
                                    `${API}/api/admin/dhl/ship/${order.id}`,
                                    { method: "POST", credentials: "include" },
                                  );
                                  const json = await res.json();
                                  if (json.success) {
                                    await fetch(
                                      `${API}/api/orders/${order.id}/status`,
                                      {
                                        method: "PATCH",
                                        headers: {
                                          "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                          status: "shipped",
                                        }),
                                      },
                                    );
                                    showToast(
                                      `DHL: ${json.data.trackingNumber}`,
                                    );
                                    fetchOrders();
                                  } else {
                                    showToast(json.error || "Błąd DHL", "err");
                                  }
                                } catch (err: any) {
                                  showToast(err.message || "Błąd DHL", "err");
                                }
                              }}
                              className="px-2 py-1 rounded bg-yellow-600 text-white text-xs"
                            >
                              📦 DHL
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const s = order.shipping as any;
                                  const pc = s.differentShippingAddress
                                    ? s.shippingPostalCode || s.postalCode
                                    : s.postalCode;
                                  const offRes = await fetch(
                                    `${API}/api/admin/wysylajnami/offers`,
                                    {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      credentials: "include",
                                      body: JSON.stringify({
                                        weightKg: order.totalWeight,
                                        postalCode: pc,
                                      }),
                                    },
                                  );
                                  const offJson = await offRes.json();
                                  const offers = offJson.data?.offers || [];
                                  if (!offers.length) {
                                    showToast("Brak ofert Wysylajnami", "err");
                                    return;
                                  }
                                  setWnModal({ order, offers });
                                } catch (err: any) {
                                  showToast(err.message || "Błąd", "err");
                                }
                              }}
                              className="px-2 py-1 rounded bg-green-600 text-white text-xs"
                            >
                              🚛 Wysyłaj z nami
                            </button>
                          </>
                        )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2">
                    <div className="flex gap-1 items-center">
                      {order.status !== "cancelled" ? (
                        <button
                          onClick={() => {
                            setOrderToCancel(order.id);
                            setCancelModalOpen(true);
                          }}
                          className="p-1.5 rounded bg-red-600 text-white text-xs hover:bg-red-700"
                          title="Anuluj"
                        >
                          🗑
                        </button>
                      ) : (
                        <div className="relative">
                          <button
                            onClick={() =>
                              setShowCancellationReason(
                                showCancellationReason === order.id
                                  ? null
                                  : order.id,
                              )
                            }
                            className="p-1.5 rounded hover:bg-[hsl(var(--accent))]"
                            title="Powód anulowania"
                          >
                            ℹ️
                          </button>
                          {showCancellationReason === order.id &&
                            order.cancellationReason && (
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 bg-[hsl(var(--card))] border border-[hsl(var(--border))] p-3 rounded-lg shadow-xl min-w-[200px] max-w-[300px] text-xs">
                                <div className="font-semibold mb-1 text-[hsl(var(--muted-foreground))]">
                                  Powód anulowania:
                                </div>
                                <div className="font-medium text-[hsl(var(--foreground))]">
                                  {order.cancellationReason}
                                </div>
                                {order.cancelledAt && (
                                  <div className="text-[hsl(var(--muted-foreground))] mt-2 border-t border-[hsl(var(--border))] pt-2">
                                    {new Date(order.cancelledAt).toLocaleString(
                                      "pl-PL",
                                    )}
                                  </div>
                                )}
                                {order.cancelledBy && (
                                  <div className="text-[hsl(var(--muted-foreground))]">
                                    przez: {order.cancelledBy}
                                  </div>
                                )}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                                  <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[hsl(var(--card))]" />
                                </div>
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ═══════════ PAGINATION ═══════════ */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => fetchOrders(currentPage - 1)}
          disabled={currentPage === 0}
          className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm disabled:opacity-50"
        >
          ← Poprzednia
        </button>
        <div className="flex items-center gap-2 text-sm">
          <span>Strona</span>
          <input
            type="number"
            min="1"
            max={totalPages}
            value={currentPage + 1}
            onChange={(e) => {
              const page = parseInt(e.target.value) - 1;
              if (page >= 0 && page < totalPages) fetchOrders(page);
            }}
            className="w-16 text-center h-9 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
          />
          <span>z {totalPages}</span>
        </div>
        <button
          onClick={() => fetchOrders(currentPage + 1)}
          disabled={currentPage >= totalPages - 1}
          className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm disabled:opacity-50"
        >
          Następna →
        </button>
      </div>

      {/* ═══════════ FLOATING MARKED WIDGET ═══════════ */}
      {markedOrders.length > 0 && (
        <MarkedOrdersWidget
          orders={markedOrders}
          setMarkedOrders={setMarkedOrders}
          onCancel={handleCancelMultiple}
          onExport={handleExportCSV}
        />
      )}

      {/* ═══════════ MODALS ═══════════ */}
      {selectedOrder && (
        <OrderDetailsDialog
          order={selectedOrder}
          onClose={() => {
            setSelectedOrder(null);
            fetchOrders();
          }}
          onStatusChange={() => {
            setSelectedOrder(null);
            fetchOrders();
            showToast("Status zaktualizowany");
          }}
        />
      )}

      <CancelOrderModal
        isOpen={cancelModalOpen}
        onClose={() => {
          setCancelModalOpen(false);
          setOrderToCancel(null);
          setOrdersToCancel([]);
        }}
        onConfirm={confirmCancellation}
        orderCount={ordersToCancel.length || 1}
        orderNumber={
          orderToCancel
            ? orders.find((o) => o.id === orderToCancel)?.orderNumber
            : undefined
        }
      />

      {/* Wysylajnami Courier Select */}
      {wnModal && (
        <CourierSelectModal
          offers={wnModal.offers}
          orderNumber={wnModal.order.orderNumber}
          weight={Number(wnModal.order.totalWeight)}
          loading={wnLoading}
          onClose={() => setWnModal(null)}
          onSelect={async (offer) => {
            setWnLoading(true);
            try {
              const res = await fetch(
                `${API}/api/admin/wysylajnami/ship/${wnModal.order.id}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ courierId: offer.courierId }),
                },
              );
              const json = await res.json();
              if (json.success) {
                await fetch(`${API}/api/orders/${wnModal.order.id}/status`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "shipped" }),
                });
                showToast(
                  `${offer.courierName}: ${json.data.waybillNumber} (${json.data.price} PLN)`,
                );
                setWnModal(null);
                fetchOrders();
              } else {
                showToast(json.error || "Błąd", "err");
              }
            } catch (err: any) {
              showToast(err.message || "Błąd", "err");
            } finally {
              setWnLoading(false);
            }
          }}
        />
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </div>
  );
}

// ============================================
// FedEx Pickup Button
// ============================================
function FedExPickupButton() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);

  const checkStatus = async () => {
    try {
      const res = await fetch(`${API}/api/admin/fedex/pickup/status`, {
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) setStatus(json.data);
    } catch {}
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const handlePickup = async () => {
    if (
      !confirm(
        "Zamówić podjazd kuriera FedEx dla wszystkich gotowych przesyłek?",
      )
    )
      return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/fedex/pickup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.success) {
        alert(
          `✅ Kurier zamówiony!\nKod: ${json.data.confirmationCode}\nPaczek: ${json.data.ordersCount}\nZamówienia: ${json.data.orderNumbers.join(", ")}`,
        );
        checkStatus();
      } else {
        alert(`❌ ${json.error}`);
      }
    } catch (err: any) {
      alert(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!status?.activePickup || !confirm("Anulować podjazd kuriera?")) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/fedex/pickup/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(status.activePickup),
      });
      const json = await res.json();
      if (json.success) {
        alert("✅ Podjazd anulowany");
        checkStatus();
      } else {
        alert(`❌ ${json.error}`);
      }
    } catch (err: any) {
      alert(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!status) return null;

  return (
    <div className="flex items-center gap-2">
      {status.pendingPickup > 0 && !status.activePickup && (
        <button
          onClick={handlePickup}
          disabled={loading}
          className="h-9 px-3 rounded-lg bg-blue-600 text-white text-sm font-medium flex items-center gap-1"
        >
          {loading
            ? "⏳..."
            : `🚛 Przywołaj FEDEX (${status.pendingPickup} paczek)`}
        </button>
      )}
      {status.activePickup && (
        <>
          <span className="text-xs text-green-500 font-medium">
            ✅ Kurier zamówiony ({status.activePickup.confirmationCode})
          </span>
          <button
            onClick={handleCancel}
            disabled={loading}
            className="h-7 px-2 rounded border border-red-500 text-red-500 text-xs"
          >
            Anuluj
          </button>
        </>
      )}
      {status.pendingPickup === 0 && !status.activePickup && (
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          🚛 Brak paczek do odbioru
        </span>
      )}
    </div>
  );
}

function DHLPickupButton() {
  const [loading, setLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const checkStatus = async () => {
    try {
      const res = await fetch(`${API}/api/admin/dhl/pickup/status`, {
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) setPendingCount(json.data.pendingPickup || 0);
    } catch {}
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const handlePickup = async () => {
    if (
      !confirm("Zamówić podjazd kuriera DHL dla wszystkich gotowych przesyłek?")
    )
      return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/dhl/pickup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.success) {
        alert(
          `✅ Kurier DHL zamówiony!\nZlecenia: ${json.data.orderIds.join(", ")}\nPaczek: ${json.data.ordersCount}`,
        );
        checkStatus();
      } else {
        alert(`❌ ${json.error}`);
      }
    } catch (err: any) {
      alert(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (pendingCount === 0) return null;

  return (
    <button
      onClick={handlePickup}
      disabled={loading}
      className="h-9 px-3 rounded-lg bg-yellow-600 text-white text-sm font-medium flex items-center gap-1"
    >
      {loading ? "⏳..." : `🚛 Kurier DHL (${pendingCount} paczek)`}
    </button>
  );
}

// ============================================
// MarkedOrdersWidget (floating panel - like old one)
// ============================================
function MarkedOrdersWidget({
  orders,
  setMarkedOrders,
  onCancel,
  onExport,
}: {
  orders: Order[];
  setMarkedOrders: (o: Order[]) => void;
  onCancel: () => void;
  onExport: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating button */}
      <div className="fixed bottom-20 right-4 z-50">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="rounded-full h-14 w-14 shadow-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center relative"
        >
          <span
            className={`text-xl transition-transform ${isOpen ? "rotate-180" : ""}`}
          >
            ▼
          </span>
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center font-bold">
            {orders.length}
          </span>
        </button>
      </div>

      {/* Panel */}
      {isOpen && (
        <div
          className="fixed bottom-36 right-6 z-40 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg shadow-2xl w-[420px] max-h-[500px] overflow-hidden"
          style={{ animation: "fadeIn .15s ease" }}
        >
          {/* Header */}
          <div className="bg-[hsl(var(--accent))] p-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
            <h3 className="font-semibold text-sm">
              Zaznaczone zamówienia ({orders.length})
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setMarkedOrders([])}
                className="text-xs px-2 py-1 rounded hover:bg-[hsl(var(--background))]"
              >
                Odznacz wszystkie
              </button>
              <button onClick={() => setIsOpen(false)} className="text-xs px-1">
                ✕
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[350px] p-2">
            {orders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between p-3 hover:bg-[hsl(var(--accent))]/50 rounded-lg mb-1 group"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="relative flex-shrink-0">
                    {(order.items[0]?.mainImage || order.items[0]?.image) && (
                      <img
                        src={order.items[0]?.mainImage || order.items[0]?.image}
                        alt=""
                        className="w-12 h-12 object-cover rounded border"
                      />
                    )}
                    {order.items.length > 1 && (
                      <span className="absolute -bottom-1 -right-1 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
                        +{order.items.length - 1}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {order.orderNumber}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs flex-shrink-0 ${
                          order.paymentMethod === "cod" &&
                          order.status === "paid"
                            ? "bg-red-100 text-red-700"
                            : statusColors[order.status]
                        }`}
                      >
                        {order.paymentMethod === "cod" &&
                        order.status === "paid"
                          ? "Pobranie"
                          : statusLabels[order.status]}
                      </span>
                    </div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 truncate">
                      {order.items[0]?.name}
                    </div>
                    <div className="text-xs text-[hsl(var(--muted-foreground))]">
                      {order.shipping.firstName} {order.shipping.lastName} •{" "}
                      {fmt(order.total)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setMarkedOrders(orders.filter((o) => o.id !== order.id))
                  }
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t border-[hsl(var(--border))] p-4 bg-[hsl(var(--accent))]/30 flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium"
            >
              🗑 Anuluj zaznaczone
            </button>
            <button
              onClick={onExport}
              className="flex-1 px-3 py-2 rounded-lg border border-[hsl(var(--border))] text-sm"
            >
              📤 Eksportuj CSV
            </button>
          </div>
        </div>
      )}
    </>
  );
}
