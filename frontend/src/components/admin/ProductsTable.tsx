import React, { useState, useEffect, useCallback, useRef } from "react";

// ============================================================
// TYPES
// ============================================================
interface Product {
  id: string;
  name: string;
  manufacturer: string;
  price: number;
  stock: number;
  condition: string;
  power: { value: string; range: string };
  rpm: { value: string; range: string };
  shaftDiameter: number;
  sleeveDiameter: number | null;
  flangeSize: number | null;
  flangeBoltCircle: number | null;
  mechanicalSize: number;
  weight: number | null;
  legSpacing: string;
  hasBreak: boolean;
  hasForeignCooling: boolean;
  hasEx: boolean;
  startType: string | null;
  mainImage: string;
  galleryImages: string[];
  description: string;
  technicalDetails: string;
  dataSheets: string[];
  customParameters: { name: string; value: string }[];
  marketplaces: any;
  categories: { id: string; name: string; slug: string }[];
}

interface Category {
  id: string;
  name: string;
  slug: string;
  order?: number;
}
interface Manufacturer {
  id: string;
  name: string;
  slug: string;
}

interface AllegroOffer {
  id: string;
  name: string;
  price: string;
  stock: number;
  image: string | null;
}

interface LinkingModal {
  open: boolean;
  productId: string;
  productName: string;
  searchTerm: string;
  offers: AllegroOffer[];
  loading: boolean;
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
  // Only add Content-Type for requests with body
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

// Raw fetch for Allegro endpoints (no JSON content-type for empty body)
async function allegroApi<T = any>(
  path: string,
  opts?: RequestInit,
): Promise<T> {
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
  const json = await res.json();
  return json as T;
}

// ============================================================
// HELPERS
// ============================================================
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

function fmtPrice(v: number | null | undefined): string {
  if (!v) return "0 (cena)";
  return v.toLocaleString("pl-PL", { style: "currency", currency: "PLN" });
}

function getOwnStorePrice(p: Product): number {
  return p.marketplaces?.ownStore?.price ?? p.price ?? 0;
}

function htmlToText(html: string): string {
  return (html || "").replace(/<p>/g, "").replace(/<\/p>/g, "\n").trim();
}

function textToHtml(text: string): string {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => `<p>${l}</p>`)
    .join("");
}

const START_TYPE_OPTIONS = [
  "bezpośredni - 220/380V",
  "bezpośredni - 230/400V",
  "gwiazda-trójkąt - 380/660V",
  "gwiazda-trójkąt - 400/690V",
  "gwiazda-trójkąt - 380V△",
  "gwiazda-trójkąt - 400V△",
];

// ============================================================
// ALLEGRO HELPERS
// ============================================================
function getAleggroData(p: Product) {
  return p.marketplaces?.allegro || null;
}

function hasAllegroLink(p: Product): boolean {
  return !!p.marketplaces?.allegro?.productId;
}

function getAllegroUrl(p: Product): string | null {
  return p.marketplaces?.allegro?.url || null;
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export function ProductsTable() {
  // --- DATA STATE ---
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // --- PAGINATION / SORT / SEARCH ---
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(20);
  const [sortField, setSortField] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [allegroFilter, setAllegroFilter] = useState<
    "all" | "linked" | "unlinked"
  >("all");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- SELECTION ---
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // --- EDITING ---
  const [editingCell, setEditingCell] = useState<{
    id: string;
    field: string;
  } | null>(null);
  const editRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  // --- MODALS ---
  const [descModal, setDescModal] = useState<{
    open: boolean;
    id: string;
    content: string;
  }>({ open: false, id: "", content: "" });
  const [techModal, setTechModal] = useState<{
    open: boolean;
    id: string;
    content: string;
  }>({ open: false, id: "", content: "" });
  const [mfgModal, setMfgModal] = useState<{
    open: boolean;
    id: string;
    search: string;
  }>({ open: false, id: "", search: "" });
  const [paramModal, setParamModal] = useState<{
    open: boolean;
    id: string;
    name: string;
    value: string;
  }>({ open: false, id: "", name: "", value: "" });
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [generatingAI, setGeneratingAI] = useState<string | null>(null);

  // --- ALLEGRO LINKING MODAL ---
  const [linkModal, setLinkModal] = useState<LinkingModal>({
    open: false,
    productId: "",
    productName: "",
    searchTerm: "",
    offers: [],
    loading: false,
  });

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
        3500,
      );
    },
    [],
  );

  // ============================================================
  // FETCH DATA
  // ============================================================
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sortField,
        sortDirection: sortDir,
      });
      if (search) params.set("search", search);
      if (allegroFilter !== "all") params.set("allegroFilter", allegroFilter);

      const res = await api<any>(`/api/admin/products?${params}`);
      const d = res.data;
      setProducts(d.products);
      setTotal(d.total);
      setTotalPages(d.totalPages);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [page, limit, sortField, sortDir, search, allegroFilter, toast]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    api("/api/admin/products/categories")
      .then((r) => setCategories(r.data))
      .catch(() => {});
    api("/api/admin/products/manufacturers")
      .then((r) => setManufacturers(r.data))
      .catch(() => {});
  }, []);

  // ============================================================
  // SEARCH DEBOUNCE
  // ============================================================
  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(0);
    }, 300);
  };

  // ============================================================
  // SORT
  // ============================================================
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(0);
  };

  // ============================================================
  // UPDATE PRODUCT
  // ============================================================
  const updateField = async (productId: string, field: string, value: any) => {
    try {
      const product = products.find((p) => p.id === productId);
      if (!product) return;

      let body: any = {};

      switch (field) {
        case "name":
        case "manufacturer":
        case "legSpacing":
        case "startType":
        case "description":
        case "technicalDetails":
          body[field] = value;
          break;
        case "price":
          body.price = parseFloat(value);
          body.marketplaces = {
            ...product.marketplaces,
            ownStore: {
              ...product.marketplaces?.ownStore,
              price: parseFloat(value),
            },
          };
          break;
        case "stock":
          body.stock = parseInt(value);
          break;
        case "power":
          body.power = { ...product.power, value: value };
          break;
        case "rpm":
          body.rpm = { ...product.rpm, value: value };
          break;
        case "shaftDiameter":
        case "sleeveDiameter":
        case "flangeBoltCircle":
        case "flangeSize":
        case "weight":
          body[field] = parseFloat(value) || 0;
          break;
        case "mechanicalSize":
          body.mechanicalSize = parseInt(value) || 0;
          break;
        case "condition":
          body.condition = value;
          break;
        case "hasBreak":
        case "hasForeignCooling":
          body[field] = value;
          break;
        case "categoryId":
          body.categoryId = value;
          break;
        case "customParameters":
          body.customParameters = value;
          break;
        case "dataSheets":
          body.dataSheets = value;
          break;
        case "mainImage":
          body.mainImage = value;
          break;
        case "galleryImages":
          body.galleryImages = value;
          break;
        default:
          body[field] = value;
      }

      await api(`/api/admin/products/${productId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });

      // Update local state
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== productId) return p;
          const updated = { ...p };
          if (body.price !== undefined) updated.price = body.price;
          if (body.stock !== undefined) updated.stock = body.stock;
          if (body.name !== undefined) updated.name = body.name;
          if (body.manufacturer !== undefined)
            updated.manufacturer = body.manufacturer;
          if (body.power !== undefined) updated.power = body.power;
          if (body.rpm !== undefined) updated.rpm = body.rpm;
          if (body.condition !== undefined) updated.condition = body.condition;
          if (body.description !== undefined)
            updated.description = body.description;
          if (body.technicalDetails !== undefined)
            updated.technicalDetails = body.technicalDetails;
          if (body.mainImage !== undefined) updated.mainImage = body.mainImage;
          if (body.galleryImages !== undefined)
            updated.galleryImages = body.galleryImages;
          if (body.dataSheets !== undefined)
            updated.dataSheets = body.dataSheets;
          if (body.customParameters !== undefined)
            updated.customParameters = body.customParameters;
          if (body.hasBreak !== undefined) updated.hasBreak = body.hasBreak;
          if (body.hasForeignCooling !== undefined)
            updated.hasForeignCooling = body.hasForeignCooling;
          if (body.startType !== undefined) updated.startType = body.startType;
          if (body.weight !== undefined) updated.weight = body.weight;
          if (body.mechanicalSize !== undefined)
            updated.mechanicalSize = body.mechanicalSize;
          if (body.shaftDiameter !== undefined)
            updated.shaftDiameter = body.shaftDiameter;
          if (body.sleeveDiameter !== undefined)
            updated.sleeveDiameter = body.sleeveDiameter;
          if (body.flangeSize !== undefined)
            updated.flangeSize = body.flangeSize;
          if (body.flangeBoltCircle !== undefined)
            updated.flangeBoltCircle = body.flangeBoltCircle;
          if (body.legSpacing !== undefined)
            updated.legSpacing = body.legSpacing;
          if (body.marketplaces !== undefined)
            updated.marketplaces = body.marketplaces;
          return updated;
        }),
      );

      setEditingCell(null);
      toast("Zaktualizowano produkt");
    } catch (e: any) {
      toast(e.message || "Błąd aktualizacji", "error");
    }
  };

  // ============================================================
  // DELETE
  // ============================================================
  const handleDelete = async (id: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten produkt?")) return;
    try {
      await api(`/api/admin/products/${id}`, { method: "DELETE" });
      toast("Produkt usunięty");
      fetchProducts();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Usunąć ${selected.size} produktów?`)) return;
    try {
      await api("/api/admin/products/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      toast(`Usunięto ${selected.size} produktów`);
      setSelected(new Set());
      fetchProducts();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  // ============================================================
  // IMAGE UPLOAD
  // ============================================================
  const uploadImage = async (
    productId: string,
    file: File,
    target: "main" | "gallery",
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API}/api/admin/products/upload/images`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      const url = json.data.urls[0];
      const product = products.find((p) => p.id === productId)!;
      if (target === "main") {
        await updateField(productId, "mainImage", url);
      } else {
        await updateField(productId, "galleryImages", [
          ...(product.galleryImages || []),
          url,
        ]);
      }
      toast("Zdjęcie dodane");
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  // ============================================================
  // PDF UPLOAD
  // ============================================================
  const uploadPdf = async (productId: string, files: FileList) => {
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("file", f));
    try {
      const res = await fetch(`${API}/api/admin/products/upload/datasheets`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      const product = products.find((p) => p.id === productId)!;
      await updateField(productId, "dataSheets", [
        ...(product.dataSheets || []),
        ...json.data.urls,
      ]);
      toast(`Dodano ${json.data.urls.length} PDF`);
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  // ============================================================
  // AI DESCRIPTION
  // ============================================================
  const generateDescription = async (productId: string) => {
    if (!confirm("Wygenerować nowy opis AI? Obecny zostanie zastąpiony."))
      return;
    setGeneratingAI(productId);
    try {
      const res = await api<any>("/api/admin/products/generate-description", {
        method: "POST",
        body: JSON.stringify({ productId }),
      });
      await updateField(productId, "description", res.data.description);
      toast("Opis AI wygenerowany");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setGeneratingAI(null);
    }
  };

  // ============================================================
  // CREATE MANUFACTURER
  // ============================================================
  const createManufacturer = async (name: string) => {
    try {
      const res = await api<any>("/api/admin/products/manufacturers", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setManufacturers((prev) =>
        [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)),
      );
      return res.data;
    } catch (e: any) {
      toast(e.message, "error");
      return null;
    }
  };

  // ============================================================
  // ALLEGRO LINK / UNLINK
  // ============================================================
  const openLinkModal = async (product: Product) => {
    setLinkModal({
      open: true,
      productId: product.id,
      productName: product.name,
      searchTerm: "",
      offers: [],
      loading: true,
    });

    try {
      const data = await allegroApi<any>("/api/allegro/unlinked-offers");
      if (data.success && data.data) {
        // Pre-filter by product name match
        const filtered = data.data.filter((offer: AllegroOffer) => {
          const sl = product.name.toLowerCase();
          const ol = offer.name.toLowerCase();
          return ol.includes(sl) || sl.includes(ol);
        });
        setLinkModal((prev) => ({
          ...prev,
          offers: filtered.length > 0 ? filtered : data.data,
          loading: false,
        }));
      } else {
        setLinkModal((prev) => ({ ...prev, offers: [], loading: false }));
      }
    } catch {
      setLinkModal((prev) => ({ ...prev, offers: [], loading: false }));
      toast("Nie udało się pobrać ofert Allegro", "error");
    }
  };

  const linkProductToAllegro = async (
    allegroOfferId: string,
    force = false,
  ) => {
    if (!linkModal.productId) return;
    try {
      const data = await allegroApi<any>(
        `/api/allegro/link-product/${linkModal.productId}`,
        {
          method: "POST",
          body: JSON.stringify({ allegroOfferId, force }),
        },
      );

      if (data.success) {
        toast("Produkt powiązany z Allegro");
        // Update local product state
        setProducts((prev) =>
          prev.map((p) => {
            if (p.id !== linkModal.productId) return p;
            return {
              ...p,
              marketplaces: {
                ...p.marketplaces,
                allegro: {
                  active: true,
                  productId: allegroOfferId,
                  url: `https://allegro.pl/oferta/${allegroOfferId}`,
                  lastSyncAt: new Date().toISOString(),
                },
              },
            };
          }),
        );
        setLinkModal({
          open: false,
          productId: "",
          productName: "",
          searchTerm: "",
          offers: [],
          loading: false,
        });
      } else if (data.conflictingProductId) {
        if (confirm(`${data.error}\n\nCzy chcesz wymusić powiązanie?`)) {
          return linkProductToAllegro(allegroOfferId, true);
        }
      } else {
        toast(data.error || "Błąd powiązywania", "error");
      }
    } catch (e: any) {
      toast(e.message || "Błąd powiązywania", "error");
    }
  };

  const unlinkProduct = async (productId: string, productName: string) => {
    if (
      !confirm(
        `Usunąć powiązanie z Allegro dla "${productName}"?\n\nTo nie usunie oferty z Allegro — tylko odłączy ją od tego produktu.`,
      )
    )
      return;

    try {
      const data = await allegroApi<any>(
        `/api/allegro/unlink-product/${productId}`,
        {
          method: "DELETE",
        },
      );
      if (data.success) {
        toast("Powiązanie z Allegro usunięte");
        setProducts((prev) =>
          prev.map((p) => {
            if (p.id !== productId) return p;
            const { allegro, ...restMp } = p.marketplaces || {};
            return { ...p, marketplaces: restMp };
          }),
        );
      } else {
        toast(data.error || "Błąd usuwania powiązania", "error");
      }
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  // ============================================================
  // SELECTION HELPERS
  // ============================================================
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allIds = products.map((p) => p.id);
    const allSelected = allIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      allIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  // ============================================================
  // INLINE EDIT COMPONENT
  // ============================================================
  const EditCell = ({
    product,
    field,
    type = "text",
    suffix = "",
  }: {
    product: Product;
    field: string;
    type?: string;
    suffix?: string;
  }) => {
    const isEditing =
      editingCell?.id === product.id && editingCell?.field === field;

    let displayValue = "";
    let rawValue = "";

    switch (field) {
      case "power":
        rawValue =
          product.power?.value
            ?.toString()
            .replace(/\s*kW\s*/gi, "")
            .trim() || "0";
        displayValue = `${rawValue} kW`;
        break;
      case "rpm":
        rawValue = product.rpm?.value?.toString() || "0";
        displayValue = `${rawValue} obr./min`;
        break;
      case "price":
        rawValue = String(getOwnStorePrice(product));
        displayValue = fmtPrice(getOwnStorePrice(product));
        break;
      case "stock":
        rawValue = String(product.stock || 0);
        displayValue = `${product.stock || 0} szt.`;
        break;
      case "shaftDiameter":
        rawValue = String(product.shaftDiameter || 0);
        displayValue = `${product.shaftDiameter || 0} mm`;
        break;
      case "sleeveDiameter":
        rawValue = String(product.sleeveDiameter || 0);
        displayValue = `${product.sleeveDiameter || 0} mm`;
        break;
      case "flangeBoltCircle":
        rawValue = String(product.flangeBoltCircle || 0);
        displayValue = `${product.flangeBoltCircle || 0} mm`;
        break;
      case "flangeSize":
        rawValue = String(product.flangeSize || 0);
        displayValue = `${product.flangeSize || 0} mm`;
        break;
      case "mechanicalSize":
        rawValue = String(product.mechanicalSize || 0);
        displayValue = `${product.mechanicalSize || 0}`;
        break;
      case "weight":
        rawValue = String(product.weight || 0);
        displayValue = `${product.weight || 0} kg`;
        break;
      case "legSpacing":
        rawValue = product.legSpacing || "";
        displayValue = rawValue || "—";
        break;
      case "name":
        rawValue = product.name;
        displayValue = product.name;
        break;
      default:
        rawValue = String((product as any)[field] || "");
        displayValue = rawValue || "—";
    }

    if (suffix) displayValue = `${rawValue || "0"} ${suffix}`;

    if (isEditing) {
      return (
        <div>
          <input
            ref={(el) => {
              editRef.current = el;
            }}
            type={type}
            step={
              type === "number" ? (field === "price" ? "0.01" : "1") : undefined
            }
            defaultValue={rawValue}
            autoFocus
            style={{ width: "100%", minWidth: 60 }}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                updateField(
                  product.id,
                  field,
                  (e.target as HTMLInputElement).value,
                );
              if (e.key === "Escape") setEditingCell(null);
            }}
          />
          <div className="edit-controls">
            <button
              className="edit-confirm"
              onClick={() =>
                editRef.current &&
                updateField(product.id, field, editRef.current.value)
              }
            >
              ✓
            </button>
            <button
              className="edit-cancel"
              onClick={() => setEditingCell(null)}
            >
              ✕
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        className="cell-editable"
        onClick={() => setEditingCell({ id: product.id, field })}
      >
        {displayValue}
      </div>
    );
  };

  // ============================================================
  // STOCK BADGE
  // ============================================================
  const StockBadge = ({ product }: { product: Product }) => {
    const isEditing =
      editingCell?.id === product.id && editingCell?.field === "stock";
    const stock = product.stock || 0;
    const cls =
      stock > 5 ? "badge-green" : stock > 0 ? "badge-yellow" : "badge-red";

    if (isEditing) {
      return (
        <div>
          <input
            ref={(el) => {
              editRef.current = el;
            }}
            type="number"
            defaultValue={stock}
            autoFocus
            style={{ width: 80 }}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                updateField(
                  product.id,
                  "stock",
                  (e.target as HTMLInputElement).value,
                );
              if (e.key === "Escape") setEditingCell(null);
            }}
          />
          <div className="edit-controls">
            <button
              className="edit-confirm"
              onClick={() =>
                editRef.current &&
                updateField(product.id, "stock", editRef.current.value)
              }
            >
              ✓
            </button>
            <button
              className="edit-cancel"
              onClick={() => setEditingCell(null)}
            >
              ✕
            </button>
          </div>
        </div>
      );
    }

    return (
      <span
        className={`badge ${cls} cell-editable`}
        onClick={() => setEditingCell({ id: product.id, field: "stock" })}
      >
        {stock} szt.
      </span>
    );
  };

  // ============================================================
  // COLUMN DEFINITIONS
  // ============================================================
  const COLUMNS: {
    key: string;
    label: string;
    width: string;
    sortable?: boolean;
    stickyClass?: string;
  }[] = [
    { key: "checkbox", label: "", width: "w-10", stickyClass: "col-sticky-0" },
    {
      key: "name",
      label: "Nazwa",
      width: "min-w-[300px]",
      sortable: true,
      stickyClass: "col-sticky-1",
    },
    {
      key: "mainImage",
      label: "Zdjęcie",
      width: "w-[100px]",
      stickyClass: "col-sticky-2",
    },
    { key: "gallery", label: "Galeria", width: "min-w-[200px]" },
    { key: "price", label: "Cena", width: "min-w-[110px]", sortable: true },
    { key: "stock", label: "Stan", width: "min-w-[90px]", sortable: true },
    { key: "power", label: "Moc", width: "min-w-[120px]", sortable: false },
    { key: "rpm", label: "Obroty", width: "min-w-[130px]", sortable: false },
    {
      key: "condition",
      label: "Stan produktu",
      width: "min-w-[140px]",
      sortable: true,
    },
    { key: "weight", label: "Waga", width: "min-w-[90px]", sortable: true },
    {
      key: "mechanicalSize",
      label: "Wlk. mech.",
      width: "min-w-[100px]",
      sortable: true,
    },
    {
      key: "shaftDiameter",
      label: "Śr. wału",
      width: "min-w-[100px]",
      sortable: true,
    },
    { key: "sleeveDiameter", label: "Śr. tulei", width: "min-w-[100px]" },
    {
      key: "flangeBoltCircle",
      label: "Śr. podz. otw.",
      width: "min-w-[120px]",
    },
    { key: "flangeSize", label: "Śr. kołnierza", width: "min-w-[110px]" },
    { key: "legSpacing", label: "Rozstaw łap", width: "min-w-[110px]" },
    { key: "hasBreak", label: "Hamulec", width: "min-w-[80px]" },
    { key: "hasForeignCooling", label: "Obce chł.", width: "min-w-[80px]" },
    { key: "startType", label: "Rozruch", width: "min-w-[180px]" },
    { key: "customParameters", label: "Parametry", width: "min-w-[260px]" },
    { key: "dataSheet", label: "Dokumentacja", width: "min-w-[220px]" },
    {
      key: "manufacturer",
      label: "Producent",
      width: "min-w-[150px]",
      sortable: true,
    },
    { key: "categories", label: "Kategoria", width: "min-w-[200px]" },
    { key: "description", label: "Opis", width: "min-w-[220px]" },
    { key: "actions", label: "Akcje", width: "min-w-[70px]" },
  ];

  // ============================================================
  // RENDER CELL
  // ============================================================
  const renderCell = (product: Product, col: string) => {
    switch (col) {
      case "checkbox":
        return (
          <input
            type="checkbox"
            checked={selected.has(product.id)}
            onChange={() => toggleSelect(product.id)}
          />
        );

      case "name": {
        const slug = product.marketplaces?.ownStore?.slug || "";
        const catPath =
          product.categories?.[0]?.slug ||
          product.marketplaces?.ownStore?.category_path?.replace("/", "") ||
          "";
        const shopUrl = `/${catPath}/${slug}`;
        const aData = getAleggroData(product);
        const aUrl = getAllegroUrl(product);

        return (
          <div>
            <EditCell product={product} field="name" />

            {/* Links section */}
            <div
              style={{
                marginTop: 4,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {/* Shop link */}
              <a
                href={shopUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 11,
                  color: "#60a5fa",
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                🏪 Link do sklepu ↗
              </a>

              {/* Allegro link or connect button */}
              {aUrl ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <a
                    href={aUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 11,
                      color: "#f97316",
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    🅰️ Allegro ↗
                  </a>
                  <span
                    style={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: aData?.active ? "#22c55e" : "#9ca3af",
                    }}
                    title={aData?.active ? "Aktywna" : "Nieaktywna"}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      unlinkProduct(product.id, product.name);
                    }}
                    style={{
                      fontSize: 10,
                      color: "#ef4444",
                      cursor: "pointer",
                      background: "none",
                      border: "none",
                      padding: "0 2px",
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                    }}
                    title="Odłącz od Allegro"
                  >
                    ✕ Odłącz
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openLinkModal(product);
                  }}
                  style={{
                    fontSize: 11,
                    color: "#3b82f6",
                    cursor: "pointer",
                    background: "none",
                    border: "none",
                    padding: 0,
                    textDecoration: "underline",
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  🔗 Powiąż z Allegro
                </button>
              )}
            </div>
          </div>
        );
      }

      case "mainImage":
        return product.mainImage ? (
          <div style={{ position: "relative" }}>
            <img
              src={product.mainImage}
              alt=""
              className="img-thumb"
              onClick={() => setPreviewImg(product.mainImage)}
            />
            <button
              className="btn-ghost btn-sm"
              style={{
                position: "absolute",
                top: 2,
                right: 2,
                fontSize: 10,
                background: "rgba(0,0,0,.6)",
                color: "#fff",
                borderRadius: "50%",
                width: 20,
                height: 20,
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onClick={() => {
                if (confirm("Usunąć zdjęcie główne?"))
                  updateField(product.id, "mainImage", "");
              }}
            >
              ✕
            </button>
          </div>
        ) : (
          <label className="img-upload-zone">
            <span>📷</span>
            <span>Dodaj</span>
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) =>
                e.target.files?.[0] &&
                uploadImage(product.id, e.target.files[0], "main")
              }
            />
          </label>
        );

      case "gallery":
        return (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {(product.galleryImages || []).map((img, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img
                  src={img}
                  alt=""
                  className="img-thumb"
                  style={{ width: 64, height: 64 }}
                  onClick={() => setPreviewImg(img)}
                />
                <button
                  className="btn-ghost"
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    fontSize: 10,
                    background: "rgba(0,0,0,.6)",
                    color: "#fff",
                    borderRadius: "50%",
                    width: 18,
                    height: 18,
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onClick={() => {
                    if (confirm("Usunąć?"))
                      updateField(
                        product.id,
                        "galleryImages",
                        product.galleryImages.filter((_, idx) => idx !== i),
                      );
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            {(product.galleryImages?.length || 0) < 3 && (
              <label
                className="img-upload-zone"
                style={{ width: 64, height: 64 }}
              >
                <span style={{ fontSize: 16 }}>+</span>
                <span>{product.galleryImages?.length || 0}/3</span>
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) =>
                    e.target.files?.[0] &&
                    uploadImage(product.id, e.target.files[0], "gallery")
                  }
                />
              </label>
            )}
          </div>
        );

      case "price":
        return <EditCell product={product} field="price" type="number" />;
      case "stock":
        return <StockBadge product={product} />;
      case "power":
        return <EditCell product={product} field="power" />;
      case "rpm":
        return <EditCell product={product} field="rpm" />;

      case "condition":
        return (
          <select
            value={product.condition}
            onChange={(e) =>
              updateField(product.id, "condition", e.target.value)
            }
            style={{ width: "100%" }}
          >
            <option value="nowy">Nowy</option>
            <option value="uzywany">Używany</option>
            <option value="nieuzywany">Nieużywany</option>
          </select>
        );

      case "weight":
        return <EditCell product={product} field="weight" type="number" />;
      case "mechanicalSize":
        return (
          <EditCell product={product} field="mechanicalSize" type="number" />
        );
      case "shaftDiameter":
        return (
          <EditCell product={product} field="shaftDiameter" type="number" />
        );
      case "sleeveDiameter":
        return (
          <EditCell product={product} field="sleeveDiameter" type="number" />
        );
      case "flangeBoltCircle":
        return (
          <EditCell product={product} field="flangeBoltCircle" type="number" />
        );
      case "flangeSize":
        return <EditCell product={product} field="flangeSize" type="number" />;
      case "legSpacing":
        return <EditCell product={product} field="legSpacing" />;

      case "hasBreak":
        return (
          <div style={{ textAlign: "center" }}>
            <input
              type="checkbox"
              checked={!!product.hasBreak}
              onChange={(e) =>
                updateField(product.id, "hasBreak", e.target.checked)
              }
            />
            {!product.hasBreak && (
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}
              >
                (brak)
              </div>
            )}
          </div>
        );

      case "hasForeignCooling":
        return (
          <div style={{ textAlign: "center" }}>
            <input
              type="checkbox"
              checked={!!product.hasForeignCooling}
              onChange={(e) =>
                updateField(product.id, "hasForeignCooling", e.target.checked)
              }
            />
            {!product.hasForeignCooling && (
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}
              >
                (brak)
              </div>
            )}
          </div>
        );

      case "startType":
        return (
          <select
            value={product.startType || ""}
            onChange={(e) =>
              updateField(product.id, "startType", e.target.value || null)
            }
            style={{ width: "100%" }}
          >
            <option value="">Brak</option>
            {START_TYPE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        );

      case "customParameters": {
        const params = product.customParameters || [];
        return (
          <div>
            {params.map((p, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 4,
                  marginBottom: 4,
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 11 }}>
                  <b>{p.name}:</b> {p.value}
                </span>
                <button
                  className="btn-ghost btn-sm"
                  style={{ padding: "0 4px", fontSize: 10 }}
                  onClick={() =>
                    updateField(
                      product.id,
                      "customParameters",
                      params.filter((_, idx) => idx !== i),
                    )
                  }
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              className="btn btn-outline btn-sm"
              style={{ width: "100%", marginTop: 4 }}
              onClick={() =>
                setParamModal({
                  open: true,
                  id: product.id,
                  name: "",
                  value: "",
                })
              }
            >
              + Dodaj parametr
            </button>
          </div>
        );
      }

      case "dataSheet": {
        const sheets = product.dataSheets || [];
        return (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
              PDF ({sheets.length})
            </div>
            {sheets.map((url, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 4,
                  alignItems: "center",
                  marginBottom: 2,
                }}
              >
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11, color: "#60a5fa" }}
                >
                  📄 PDF {i + 1}
                </a>
                <button
                  className="btn-ghost"
                  style={{ padding: "0 4px", fontSize: 10 }}
                  onClick={() => {
                    if (confirm(`Usunąć PDF ${i + 1}?`))
                      updateField(
                        product.id,
                        "dataSheets",
                        sheets.filter((_, idx) => idx !== i),
                      );
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                color: "var(--primary)",
                cursor: "pointer",
                marginTop: 4,
                padding: "4px 0",
              }}
            >
              + Dodaj PDF
              <input
                type="file"
                accept="application/pdf"
                multiple
                hidden
                onChange={(e) =>
                  e.target.files && uploadPdf(product.id, e.target.files)
                }
              />
            </label>
            <div
              style={{
                borderTop: "1px solid var(--border)",
                marginTop: 8,
                paddingTop: 8,
              }}
            >
              {product.technicalDetails ? (
                <div
                  className="cell-editable"
                  style={{ fontSize: 11 }}
                  onClick={() =>
                    setTechModal({
                      open: true,
                      id: product.id,
                      content: htmlToText(product.technicalDetails),
                    })
                  }
                >
                  <div
                    dangerouslySetInnerHTML={{
                      __html: product.technicalDetails,
                    }}
                    style={{ maxHeight: 60, overflow: "hidden" }}
                  />
                </div>
              ) : (
                <button
                  className="btn-ghost btn-sm"
                  style={{ fontSize: 11, color: "var(--primary)" }}
                  onClick={() =>
                    setTechModal({ open: true, id: product.id, content: "" })
                  }
                >
                  + Opis dodatkowy
                </button>
              )}
            </div>
          </div>
        );
      }

      case "manufacturer":
        return (
          <div
            className="cell-editable"
            onClick={() =>
              setMfgModal({ open: true, id: product.id, search: "" })
            }
          >
            {product.manufacturer === "silnik" ? (
              <span style={{ color: "var(--danger)" }}>BRAK prod.</span>
            ) : (
              product.manufacturer || "Wybierz..."
            )}
          </div>
        );

      case "categories": {
        const filtered = categories.filter((c) => shouldShowCategory(c.name));
        const currentCatId = product.categories?.[0]?.id || "";
        return (
          <select
            value={currentCatId}
            onChange={(e) =>
              updateField(product.id, "categoryId", e.target.value)
            }
            style={{ width: "100%" }}
          >
            <option value="">Wybierz kategorię</option>
            {filtered.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        );
      }

      case "description":
        return (
          <div>
            <div
              className="cell-editable"
              style={{ maxHeight: 60, overflow: "hidden", fontSize: 12 }}
              onClick={() =>
                setDescModal({
                  open: true,
                  id: product.id,
                  content: htmlToText(product.description || ""),
                })
              }
            >
              <div
                dangerouslySetInnerHTML={{
                  __html:
                    product.description ||
                    '<span style="color:var(--text-muted)">—</span>',
                }}
              />
            </div>
            <button
              className="btn btn-outline btn-sm"
              style={{ marginTop: 6, width: "100%" }}
              disabled={generatingAI === product.id}
              onClick={() => generateDescription(product.id)}
            >
              {generatingAI === product.id
                ? "⏳ Generowanie..."
                : "🤖 Wygeneruj AI"}
            </button>
          </div>
        );

      case "actions":
        return (
          <button
            className="btn btn-ghost btn-icon"
            title="Usuń"
            onClick={() => handleDelete(product.id)}
          >
            🗑️
          </button>
        );

      default:
        return null;
    }
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div>
      {/* TOOLBAR */}
      <div className="toolbar">
        <h1>Zarządzanie produktami</h1>
        <div className="toolbar-actions">
          {selected.size > 0 && (
            <button className="btn btn-danger" onClick={handleBulkDelete}>
              Usuń zaznaczone ({selected.size})
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Pokaż:
            </span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(0);
              }}
            >
              {[5, 20, 50, 100, 200, 500, 1000].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* SEARCH */}
      <input
        type="search"
        className="search-bar"
        placeholder="Szukaj po nazwie lub producencie..."
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
      />

      {/* ALLEGRO FILTER */}
      <div
        style={{
          display: "flex",
          gap: 2,
          marginBottom: 12,
          background: "var(--bg-hover)",
          borderRadius: 8,
          padding: 2,
          width: "fit-content",
        }}
      >
        {(
          [
            ["all", `Wszystkie`],
            ["linked", `🅰️ Powiązane z Allegro`],
            ["unlinked", `⛓️‍💥 Bez Allegro`],
          ] as ["all" | "linked" | "unlinked", string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setAllegroFilter(key);
              setPage(0);
            }}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
              background:
                allegroFilter === key ? "var(--bg-card)" : "transparent",
              color:
                allegroFilter === key ? "var(--text)" : "var(--text-muted)",
              transition: "all .15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TABLE */}
      {loading ? (
        <div
          style={{
            textAlign: "center",
            padding: 60,
            color: "var(--text-muted)",
          }}
        >
          Ładowanie...
        </div>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`${col.stickyClass || ""}`}
                      style={{
                        minWidth: col.width.match(/\d+/)?.[0]
                          ? `${col.width.match(/\d+/)![0]}px`
                          : undefined,
                      }}
                      onClick={() => col.sortable && handleSort(col.key)}
                    >
                      {col.key === "checkbox" ? (
                        <input
                          type="checkbox"
                          checked={
                            products.length > 0 &&
                            products.every((p) => selected.has(p.id))
                          }
                          onChange={toggleSelectAll}
                        />
                      ) : (
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          {col.label}
                          {col.sortable && (
                            <span
                              style={{
                                opacity: sortField === col.key ? 1 : 0.3,
                                fontSize: 10,
                              }}
                            >
                              {sortField === col.key
                                ? sortDir === "asc"
                                  ? "▲"
                                  : "▼"
                                : "⇅"}
                            </span>
                          )}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  // Highlight rows without Allegro link
                  const noAllegro = !hasAllegroLink(product);
                  return (
                    <tr
                      key={product.id}
                      style={{
                        background: selected.has(product.id)
                          ? "var(--bg-hover)"
                          : noAllegro
                            ? "rgba(239,68,68,0.06)"
                            : undefined,
                      }}
                    >
                      {COLUMNS.map((col) => (
                        <td key={col.key} className={col.stickyClass || ""}>
                          {renderCell(product, col.key)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {products.length === 0 && (
                  <tr>
                    <td
                      colSpan={COLUMNS.length}
                      style={{
                        textAlign: "center",
                        padding: 40,
                        color: "var(--text-muted)",
                      }}
                    >
                      Brak produktów
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION */}
          <div className="pagination">
            <button
              className="btn btn-outline"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Poprzednia
            </button>
            <span>
              Strona {page + 1} z {totalPages} (łącznie {total} produktów)
            </span>
            <button
              className="btn btn-outline"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Następna →
            </button>
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/* ALLEGRO LINKING MODAL                                            */}
      {/* ================================================================ */}
      {linkModal.open && (
        <div
          className="modal-backdrop"
          onClick={() =>
            setLinkModal({
              open: false,
              productId: "",
              productName: "",
              searchTerm: "",
              offers: [],
              loading: false,
            })
          }
        >
          <div
            className="modal"
            style={{
              width: "90%",
              maxWidth: 900,
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2>Powiąż produkt z ofertą Allegro</h2>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    marginTop: 4,
                  }}
                >
                  Produkt: {linkModal.productName}
                </p>
              </div>
              <button
                className="btn btn-ghost"
                onClick={() =>
                  setLinkModal({
                    open: false,
                    productId: "",
                    productName: "",
                    searchTerm: "",
                    offers: [],
                    loading: false,
                  })
                }
              >
                ✕
              </button>
            </div>

            {/* Direct ID input */}
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border)",
                background: "rgba(234,179,8,0.08)",
              }}
            >
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  display: "block",
                  marginBottom: 6,
                }}
              >
                Wpisz ID oferty Allegro (np. 10676972970)
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  placeholder="ID oferty Allegro..."
                  id="allegro-link-id-input"
                  style={{ flex: 1 }}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      (e.target as HTMLInputElement).value.trim()
                    ) {
                      linkProductToAllegro(
                        (e.target as HTMLInputElement).value.trim(),
                      );
                    }
                  }}
                />
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const input = document.getElementById(
                      "allegro-link-id-input",
                    ) as HTMLInputElement;
                    if (input?.value.trim())
                      linkProductToAllegro(input.value.trim());
                  }}
                >
                  Powiąż
                </button>
              </div>
            </div>

            {/* Offer list section */}
            <div style={{ padding: "12px 16px" }}>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginBottom: 8,
                }}
              >
                Lub wybierz z listy niepowiązanych ofert:
              </p>
              <input
                type="text"
                placeholder="Filtruj po nazwie..."
                value={linkModal.searchTerm}
                onChange={(e) =>
                  setLinkModal((p) => ({ ...p, searchTerm: e.target.value }))
                }
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
              {linkModal.loading ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: 40,
                    color: "var(--text-muted)",
                  }}
                >
                  ⏳ Pobieranie ofert z Allegro...
                </div>
              ) : linkModal.offers.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  {linkModal.offers
                    .filter((o) =>
                      o.name
                        .toLowerCase()
                        .includes(linkModal.searchTerm.toLowerCase()),
                    )
                    .slice(0, 50)
                    .map((offer) => (
                      <div
                        key={offer.id}
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          padding: 10,
                        }}
                      >
                        <div style={{ display: "flex", gap: 8 }}>
                          {offer.image && (
                            <img
                              src={offer.image}
                              alt=""
                              style={{
                                width: 60,
                                height: 60,
                                objectFit: "cover",
                                borderRadius: 4,
                              }}
                            />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 500,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {offer.name}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--text-muted)",
                                marginTop: 2,
                              }}
                            >
                              ID: {offer.id}
                            </div>
                            <div style={{ fontSize: 11, marginTop: 2 }}>
                              Cena: {offer.price} zł | Stan: {offer.stock} szt.
                            </div>
                          </div>
                        </div>
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ width: "100%", marginTop: 8 }}
                          onClick={() => linkProductToAllegro(offer.id)}
                        >
                          Powiąż z tym produktem
                        </button>
                      </div>
                    ))}
                </div>
              ) : (
                <div
                  style={{
                    textAlign: "center",
                    padding: 30,
                    color: "var(--text-muted)",
                  }}
                >
                  <p>Brak niepowiązanych ofert lub nie udało się ich pobrać.</p>
                  <p style={{ fontSize: 12, marginTop: 4 }}>
                    Użyj pola powyżej, aby wpisać ID oferty ręcznie.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* OTHER MODALS (description, tech, manufacturer, params, preview)  */}
      {/* ================================================================ */}

      {/* DESCRIPTION MODAL */}
      {descModal.open && (
        <div
          className="modal-backdrop"
          onClick={() => setDescModal({ open: false, id: "", content: "" })}
        >
          <div
            className="modal"
            style={{ width: "90%", maxWidth: 900 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Edycja opisu</h2>
              <button
                className="btn btn-ghost"
                onClick={() =>
                  setDescModal({ open: false, id: "", content: "" })
                }
              >
                ✕
              </button>
            </div>
            <div
              className="modal-body"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <div>
                <label
                  style={{ fontWeight: 600, marginBottom: 8, display: "block" }}
                >
                  Edytor tekstu
                </label>
                <textarea
                  value={descModal.content}
                  onChange={(e) =>
                    setDescModal((p) => ({ ...p, content: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    minHeight: 400,
                    fontFamily: "monospace",
                    fontSize: 13,
                    resize: "vertical",
                  }}
                  placeholder="Każda linia = nowy akapit"
                />
              </div>
              <div>
                <label
                  style={{ fontWeight: 600, marginBottom: 8, display: "block" }}
                >
                  Podgląd HTML
                </label>
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    padding: 12,
                    minHeight: 400,
                    overflow: "auto",
                    fontSize: 13,
                  }}
                  dangerouslySetInnerHTML={{
                    __html: textToHtml(descModal.content),
                  }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-outline"
                onClick={() =>
                  setDescModal({ open: false, id: "", content: "" })
                }
              >
                Anuluj
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  await updateField(
                    descModal.id,
                    "description",
                    textToHtml(descModal.content),
                  );
                  setDescModal({ open: false, id: "", content: "" });
                }}
              >
                Zapisz
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TECHNICAL DETAILS MODAL */}
      {techModal.open && (
        <div
          className="modal-backdrop"
          onClick={() => setTechModal({ open: false, id: "", content: "" })}
        >
          <div
            className="modal"
            style={{ width: "90%", maxWidth: 900 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Dokumentacja techniczna</h2>
              <button
                className="btn btn-ghost"
                onClick={() =>
                  setTechModal({ open: false, id: "", content: "" })
                }
              >
                ✕
              </button>
            </div>
            <div
              className="modal-body"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <div>
                <label
                  style={{ fontWeight: 600, marginBottom: 8, display: "block" }}
                >
                  Edytor tekstu
                </label>
                <textarea
                  value={techModal.content}
                  onChange={(e) =>
                    setTechModal((p) => ({ ...p, content: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    minHeight: 400,
                    fontFamily: "monospace",
                    fontSize: 13,
                    resize: "vertical",
                  }}
                  placeholder="Wprowadź szczegóły techniczne..."
                />
              </div>
              <div>
                <label
                  style={{ fontWeight: 600, marginBottom: 8, display: "block" }}
                >
                  Podgląd HTML
                </label>
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    padding: 12,
                    minHeight: 400,
                    overflow: "auto",
                    fontSize: 13,
                  }}
                  dangerouslySetInnerHTML={{
                    __html: textToHtml(techModal.content),
                  }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-outline"
                onClick={() =>
                  setTechModal({ open: false, id: "", content: "" })
                }
              >
                Anuluj
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  await updateField(
                    techModal.id,
                    "technicalDetails",
                    textToHtml(techModal.content),
                  );
                  setTechModal({ open: false, id: "", content: "" });
                }}
              >
                Zapisz
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANUFACTURER MODAL */}
      {mfgModal.open && (
        <div
          className="modal-backdrop"
          onClick={() => setMfgModal({ open: false, id: "", search: "" })}
        >
          <div
            className="modal"
            style={{ width: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Wybierz producenta</h2>
              <button
                className="btn btn-ghost"
                onClick={() => setMfgModal({ open: false, id: "", search: "" })}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <input
                type="search"
                placeholder="Szukaj..."
                autoFocus
                value={mfgModal.search}
                onChange={(e) =>
                  setMfgModal((p) => ({ ...p, search: e.target.value }))
                }
                style={{ width: "100%", marginBottom: 12 }}
              />
              <div
                style={{
                  maxHeight: 300,
                  overflowY: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                }}
              >
                {manufacturers
                  .filter(
                    (m) =>
                      m.name.toLowerCase() !== "silnik" &&
                      m.name
                        .toLowerCase()
                        .includes(mfgModal.search.toLowerCase()),
                  )
                  .map((m) => (
                    <div
                      key={m.id}
                      className="cell-editable"
                      style={{
                        padding: "8px 12px",
                        borderBottom: "1px solid var(--border)",
                      }}
                      onClick={async () => {
                        await updateField(mfgModal.id, "manufacturer", m.name);
                        setMfgModal({ open: false, id: "", search: "" });
                      }}
                    >
                      {m.name}
                    </div>
                  ))}
              </div>
              {mfgModal.search &&
                !manufacturers.find(
                  (m) => m.name.toLowerCase() === mfgModal.search.toLowerCase(),
                ) && (
                  <button
                    className="btn btn-primary"
                    style={{ width: "100%", marginTop: 12 }}
                    onClick={async () => {
                      const mfg = await createManufacturer(
                        mfgModal.search.trim(),
                      );
                      if (mfg) {
                        await updateField(
                          mfgModal.id,
                          "manufacturer",
                          mfg.name,
                        );
                        setMfgModal({ open: false, id: "", search: "" });
                        toast("Dodano nowego producenta");
                      }
                    }}
                  >
                    + Dodaj: {mfgModal.search}
                  </button>
                )}
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM PARAMETER MODAL */}
      {paramModal.open && (
        <div
          className="modal-backdrop"
          onClick={() =>
            setParamModal({ open: false, id: "", name: "", value: "" })
          }
        >
          <div
            className="modal"
            style={{ width: 400 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Dodaj parametr</h2>
              <button
                className="btn btn-ghost"
                onClick={() =>
                  setParamModal({ open: false, id: "", name: "", value: "" })
                }
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 12 }}>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Nazwa
                </label>
                <input
                  type="text"
                  value={paramModal.name}
                  onChange={(e) =>
                    setParamModal((p) => ({ ...p, name: e.target.value }))
                  }
                  style={{ width: "100%" }}
                  autoFocus
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Wartość
                </label>
                <input
                  type="text"
                  value={paramModal.value}
                  onChange={(e) =>
                    setParamModal((p) => ({ ...p, value: e.target.value }))
                  }
                  style={{ width: "100%" }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-outline"
                onClick={() =>
                  setParamModal({ open: false, id: "", name: "", value: "" })
                }
              >
                Anuluj
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  const product = products.find((p) => p.id === paramModal.id);
                  if (!product) return;
                  await updateField(paramModal.id, "customParameters", [
                    ...(product.customParameters || []),
                    { name: paramModal.name, value: paramModal.value },
                  ]);
                  setParamModal({ open: false, id: "", name: "", value: "" });
                }}
              >
                Dodaj
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMAGE PREVIEW */}
      {previewImg && (
        <div className="modal-backdrop" onClick={() => setPreviewImg(null)}>
          <div
            style={{ position: "relative" }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImg}
              alt="Podgląd"
              style={{
                maxHeight: "85vh",
                maxWidth: "90vw",
                objectFit: "contain",
                borderRadius: 8,
              }}
            />
            <button
              className="btn btn-danger"
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                borderRadius: "50%",
                width: 32,
                height: 32,
                padding: 0,
              }}
              onClick={() => setPreviewImg(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

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

export default ProductsTable;
