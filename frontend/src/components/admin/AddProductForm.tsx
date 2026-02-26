// frontend/src/components/admin/AddProductForm.tsx
// Product creation form with optional Allegro listing
// Stack: React + Tailwind + lucide-react (Astro island, no Next.js)
// DARK MODE — matches AdminLayout CSS variables

import { useState, useEffect, useRef } from "react";
import {
  Plus,
  X,
  Loader2,
  Upload,
  Wand2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const API = import.meta.env.PUBLIC_API_URL || "http://localhost:4000";

// ============================================
// TYPES
// ============================================
interface Category {
  id: string;
  name: string;
  slug: string;
  parent?: { slug: string } | null;
}

interface Manufacturer {
  id: string;
  name: string;
  slug: string;
}

interface FormData {
  name: string;
  manufacturer: string;
  condition: "nowy" | "uzywany" | "nieuzywany";
  power: string;
  rpm: string;
  weight: string;
  shaftDiameter: string;
  sleeveDiameter: string;
  flangeSize: string;
  flangeBoltCircle: string;
  mechanicalSize: string;
  legSpacing: string;
  stock: string;
  price: string;
  description: string;
  startType: string;
  hasBreak: boolean;
  hasEx: boolean;
  hasForeignCooling: boolean;
  // Allegro
  addToAllegro: boolean;
  allegroPrice: string;
  allegroModel: string;
  allegroDescription: string;
}

const DEFAULT_FORM: FormData = {
  name: "",
  manufacturer: "",
  condition: "nowy",
  power: "",
  rpm: "",
  weight: "",
  shaftDiameter: "",
  sleeveDiameter: "",
  flangeSize: "",
  flangeBoltCircle: "",
  mechanicalSize: "",
  legSpacing: "",
  stock: "1",
  price: "",
  description: "",
  startType: "",
  hasBreak: false,
  hasEx: false,
  hasForeignCooling: false,
  addToAllegro: false,
  allegroPrice: "",
  allegroModel: "",
  allegroDescription: "",
};

const STORAGE_KEY = "product_form_draft";

const ALLEGRO_CATEGORIES = [
  "silniki-elektryczne",
  "jednofazowe",
  "trojfazowe",
  "dwubiegowe",
  "pierscieniowe",
  "z-hamulcem",
  "motoreduktory",
];

// Ordered main categories shown in the add-product form
// Each entry is a slug keyword matched via .includes()
const MAIN_CATEGORY_ORDER = [
  "trojfazowe",
  "motoreduktory",
  "jednofazowe",
  "hamul",
  "dwubiegowe",
  "akcesoria",
  "pierscieniowe",
  "wentylator",
  "pomp",
];

// ============================================
// COMPONENT
// ============================================
export default function AddProductForm() {
  const [form, setForm] = useState<FormData>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_FORM, ...JSON.parse(saved) } : DEFAULT_FORM;
    } catch {
      return DEFAULT_FORM;
    }
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [mainImage, setMainImage] = useState("");
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [customParams, setCustomParams] = useState<
    { name: string; value: string }[]
  >([]);
  const [dataSheets, setDataSheets] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingMain, setUploadingMain] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showAllegroSection, setShowAllegroSection] = useState(false);
  const [allegroConnected, setAllegroConnected] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [mfgOpen, setMfgOpen] = useState(false);
  const [mfgSearch, setMfgSearch] = useState("");
  const [creatingMfg, setCreatingMfg] = useState(false);

  const mainImageRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const mfgRef = useRef<HTMLDivElement>(null);

  const getAuthCookie = () => {
    const match = document.cookie.match(/(?:^|; )admin_token=([^;]*)/);
    return match ? match[1] : "";
  };

  const authHeaders = (): Record<string, string> => {
    const token = getAuthCookie();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Save draft on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
  }, [form]);

  // Load categories + manufacturers + check Allegro status
  useEffect(() => {
    fetch(`${API}/api/categories`)
      .then((r) => r.json())
      .then((d) => setCategories(d.data || []))
      .catch(() => {});

    fetch(`${API}/api/admin/products/manufacturers`, {
      headers: authHeaders(),
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => setManufacturers(d.data || []))
      .catch(() => {});

    fetch(`${API}/api/allegro/auth/status`)
      .then((r) => r.json())
      .then((d) => setAllegroConnected(d.data?.isAuthenticated ?? false))
      .catch(() => {});
  }, []);

  // Close manufacturer dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (mfgRef.current && !mfgRef.current.contains(e.target as Node)) {
        setMfgOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const set = (key: keyof FormData, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isAllegroSupported = ALLEGRO_CATEGORIES.includes(selectedCategory);

  // Filtered manufacturers for dropdown
  const filteredMfgs = manufacturers.filter((m) =>
    m.name
      .toLowerCase()
      .includes((mfgSearch || form.manufacturer).toLowerCase()),
  );

  const mfgExactMatch = manufacturers.some(
    (m) =>
      m.name.toLowerCase() ===
      (mfgSearch || form.manufacturer).toLowerCase().trim(),
  );

  // ---- Create Manufacturer ----
  const createManufacturer = async (name: string) => {
    setCreatingMfg(true);
    try {
      const res = await fetch(`${API}/api/admin/products/manufacturers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setManufacturers((prev) =>
          [...prev, data.data].sort((a, b) => a.name.localeCompare(b.name)),
        );
        set("manufacturer", data.data.name);
        setMfgSearch("");
        setMfgOpen(false);
        setMessage({
          type: "success",
          text: `Dodano producenta: ${data.data.name}`,
        });
      } else {
        setMessage({
          type: "error",
          text: data.error || "Błąd dodawania producenta",
        });
      }
    } catch (e: any) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setCreatingMfg(false);
    }
  };

  // ---- Image Upload ----
  // FIX #1: Changed endpoint from /api/uploads/products to /api/admin/products/upload/images|datasheets
  //         and changed form field name from "images" to "file" to match backend's request.parts()
  const uploadImages = async (
    files: FileList,
    type: "images" | "datasheets" = "images",
  ): Promise<string[]> => {
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("file", f));
    const res = await fetch(`${API}/api/admin/products/upload/${type}`, {
      method: "POST",
      body: fd,
      headers: authHeaders(),
      credentials: "include",
    });
    const data = await res.json();
    return data.success ? data.data.urls || [] : [];
  };

  const handleMainImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploadingMain(true);
    try {
      const urls = await uploadImages(e.target.files, "images");
      if (urls[0]) setMainImage(urls[0]);
    } catch {
      setMessage({ type: "error", text: "Błąd uploadu zdjęcia głównego" });
    } finally {
      setUploadingMain(false);
    }
  };

  const handleGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setUploadingGallery(true);
    try {
      const urls = await uploadImages(e.target.files, "images");
      setGalleryImages((prev) => [...prev, ...urls].slice(0, 3));
    } catch {
      setMessage({ type: "error", text: "Błąd uploadu galerii" });
    } finally {
      setUploadingGallery(false);
    }
  };

  // FIX #1b: PDF upload now uses the correct "datasheets" type
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    try {
      const urls = await uploadImages(e.target.files, "datasheets");
      setDataSheets((prev) => [...prev, ...urls]);
    } catch {
      setMessage({ type: "error", text: "Błąd uploadu PDF" });
    }
  };

  // ---- AI Description ----
  const generateDescription = async () => {
    if (!form.name || !form.manufacturer) {
      setMessage({
        type: "error",
        text: "Nazwa i producent są wymagane do generowania opisu",
      });
      return;
    }
    setGeneratingDesc(true);
    try {
      const res = await fetch(`${API}/api/ai/generate-description`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        credentials: "include",
        body: JSON.stringify({
          product: {
            name: form.name,
            manufacturer: form.manufacturer,
            power: { value: form.power },
            rpm: { value: form.rpm },
            condition: form.condition,
            mechanicalSize: form.mechanicalSize
              ? parseInt(form.mechanicalSize)
              : null,
          },
        }),
      });
      const data = await res.json();
      if (data.success && data.description) {
        set("description", data.description);
        setMessage({ type: "success", text: "Opis wygenerowany!" });
      } else {
        throw new Error(data.error || "Brak opisu");
      }
    } catch (e: any) {
      setMessage({
        type: "error",
        text: `Błąd generowania: ${e.message}`,
      });
    } finally {
      setGeneratingDesc(false);
    }
  };

  // ---- Submit ----
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors: string[] = [];
    if (!form.name.trim()) errors.push("nazwa");
    if (!selectedCategory) errors.push("kategoria");
    if (!form.price || parseFloat(form.price) <= 0) errors.push("cena > 0");
    if (!form.weight || parseFloat(form.weight) <= 0) errors.push("waga > 0");
    if (form.addToAllegro && !form.allegroModel.trim())
      errors.push("model Allegro");

    if (errors.length > 0) {
      setMessage({
        type: "error",
        text: `Wymagane pola: ${errors.join(", ")}`,
      });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const categoryData = categories
        .filter((c) => c.slug === selectedCategory)
        .map((c) => ({ id: c.slug, name: c.name, slug: c.slug }));

      const payload = {
        name: form.name,
        manufacturer: form.manufacturer,
        condition: form.condition,
        power: { value: form.power.replace(/\./g, ","), range: "" },
        rpm: { value: form.rpm.replace(/\./g, ","), range: "" },
        weight: parseFloat(form.weight) || 0,
        shaftDiameter: parseFloat(form.shaftDiameter) || 0,
        sleeveDiameter: parseFloat(form.sleeveDiameter) || 0,
        flangeSize: parseFloat(form.flangeSize) || 0,
        flangeBoltCircle: parseFloat(form.flangeBoltCircle) || 0,
        mechanicalSize: parseInt(form.mechanicalSize) || 0,
        legSpacing: form.legSpacing,
        stock: parseInt(form.stock) || 0,
        description: form.description,
        startType: form.startType || null,
        hasBreak: form.hasBreak,
        hasEx: form.hasEx,
        hasForeignCooling: form.hasForeignCooling,
        mainImage: mainImage || null,
        images: [mainImage, ...galleryImages].filter(Boolean),
        galleryImages,
        dataSheets,
        customParameters: customParams.filter((p) => p.name && p.value),
        categories: categoryData,
        price: parseFloat(form.price),
        marketplaces: {
          ownStore: { active: true, price: parseFloat(form.price) },
          ...(form.addToAllegro
            ? {
                allegro: {
                  active: true,
                  price: parseFloat(form.allegroPrice || form.price),
                },
              }
            : {}),
        },
        ...(form.addToAllegro
          ? {
              model: form.allegroModel,
              allegroDescription: form.allegroDescription,
              addToAllegro: true,
            }
          : {}),
      };

      const res = await fetch(`${API}/api/admin/products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        localStorage.removeItem(STORAGE_KEY);

        // FIX #2: Redirect to product list after successful creation
        window.location.href = "/admin/products";
      } else {
        setMessage({
          type: "error",
          text: data.error || "Błąd dodawania produktu",
        });
      }
    } catch (e: any) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================
  // STYLES — matching AdminLayout dark theme
  // ============================================
  const S = {
    section: "rounded-lg border border-[#2d3348] bg-[#1a1d27] p-5",
    sectionHeader:
      "mb-4 text-xs font-semibold uppercase tracking-wider text-[#8b8fa3]",
    label: "mb-1 block text-xs font-medium text-[#8b8fa3]",
    input:
      "w-full rounded px-3 py-2 text-sm bg-[#1e2130] border border-[#2d3348] text-[#e4e6ef] outline-none transition-colors focus:border-[#6366f1] placeholder:text-[#555a6e]",
    select:
      "w-full rounded px-3 py-2 text-sm bg-[#1e2130] border border-[#2d3348] text-[#e4e6ef] outline-none transition-colors focus:border-[#6366f1]",
    textarea:
      "w-full rounded px-3 py-2 text-sm bg-[#1e2130] border border-[#2d3348] text-[#e4e6ef] outline-none transition-colors focus:border-[#6366f1] placeholder:text-[#555a6e] font-mono",
    checkbox:
      "rounded border-[#2d3348] bg-[#1e2130] text-[#6366f1] focus:ring-[#6366f1] focus:ring-offset-0 cursor-pointer",
    checkLabel: "flex items-center gap-2 text-sm text-[#e4e6ef] cursor-pointer",
    btnPrimary:
      "inline-flex items-center gap-2 rounded-md bg-[#6366f1] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#818cf8] disabled:opacity-50 transition-colors",
    btnOutline:
      "inline-flex items-center gap-2 rounded-md border border-[#2d3348] px-4 py-2 text-sm text-[#8b8fa3] hover:text-[#e4e6ef] hover:border-[#8b8fa3] transition-colors",
    btnGhost: "text-sm text-[#8b8fa3] hover:text-[#e4e6ef] transition-colors",
    btnDanger:
      "rounded p-1.5 text-[#ef4444] hover:bg-[#7f1d1d]/30 transition-colors",
    btnAI:
      "inline-flex items-center gap-1.5 rounded-md bg-[#6366f1]/15 px-3 py-1.5 text-xs font-medium text-[#818cf8] hover:bg-[#6366f1]/25 disabled:opacity-50 transition-colors",
    btnAdd:
      "inline-flex items-center gap-1 text-xs text-[#818cf8] hover:text-[#a5b4fc] transition-colors",
    msgSuccess:
      "rounded-md border border-[#166534] bg-[#166534]/20 px-4 py-3 text-sm text-[#4ade80]",
    msgError:
      "rounded-md border border-[#7f1d1d] bg-[#7f1d1d]/20 px-4 py-3 text-sm text-[#f87171]",
    imageThumb: "h-32 w-32 rounded-lg border border-[#2d3348] object-cover",
    imageThumbSm: "h-24 w-24 rounded-lg border border-[#2d3348] object-cover",
    uploadZone:
      "flex items-center justify-center rounded-lg border-2 border-dashed border-[#2d3348] text-[#8b8fa3] hover:border-[#6366f1] hover:text-[#818cf8] transition-colors cursor-pointer",
    pdfBadge:
      "flex items-center gap-1.5 rounded bg-[#252836] px-2.5 py-1 text-xs text-[#e4e6ef]",
    allegroHeader:
      "flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-[#252836] transition-colors",
    allegroIcon:
      "flex h-6 w-6 items-center justify-center rounded bg-[#f59e0b] text-white text-xs font-bold",
  } as const;

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-[1200px]">
      {/* Message */}
      {message && (
        <div className={message.type === "success" ? S.msgSuccess : S.msgError}>
          {message.text}
        </div>
      )}

      {/* ============================================ */}
      {/* BASIC INFO */}
      {/* ============================================ */}
      <section className={S.section}>
        <h2 className={S.sectionHeader}>Informacje podstawowe</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nazwa produktu *" s={S}>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={S.input}
              required
              placeholder="np. silnik elektryczny 1,1kW 2900obr."
            />
          </Field>
          <Field label="Producent" s={S}>
            <div ref={mfgRef} className="relative">
              <input
                value={mfgOpen ? mfgSearch : form.manufacturer}
                onChange={(e) => {
                  setMfgSearch(e.target.value);
                  if (!mfgOpen) setMfgOpen(true);
                }}
                onFocus={() => {
                  setMfgSearch(form.manufacturer);
                  setMfgOpen(true);
                }}
                className={S.input}
                placeholder="Wpisz lub wybierz producenta..."
                autoComplete="off"
              />
              {mfgOpen && (
                <div className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-md border border-[#2d3348] bg-[#1e2130] shadow-lg">
                  {filteredMfgs.length > 0 ? (
                    filteredMfgs.slice(0, 30).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          set("manufacturer", m.name);
                          setMfgSearch("");
                          setMfgOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-[#e4e6ef] hover:bg-[#6366f1]/20 transition-colors"
                      >
                        {m.name}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-[#555a6e]">
                      Brak wyników
                    </div>
                  )}
                  {(mfgSearch || form.manufacturer).trim() &&
                    !mfgExactMatch && (
                      <button
                        type="button"
                        disabled={creatingMfg}
                        onClick={() =>
                          createManufacturer(
                            (mfgSearch || form.manufacturer).trim(),
                          )
                        }
                        className="w-full border-t border-[#2d3348] px-3 py-2 text-left text-sm font-medium text-[#818cf8] hover:bg-[#6366f1]/20 transition-colors disabled:opacity-50"
                      >
                        {creatingMfg
                          ? "Dodawanie..."
                          : `+ Dodaj: "${(mfgSearch || form.manufacturer).trim()}"`}
                      </button>
                    )}
                </div>
              )}
            </div>
          </Field>
          <Field label="Kategoria główna *" s={S}>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className={S.select}
              required
            >
              <option value="">Wybierz kategorię</option>
              {MAIN_CATEGORY_ORDER.map((keyword) =>
                categories.find((c) => c.slug.includes(keyword)),
              )
                .filter(Boolean)
                .map((c) => (
                  <option key={c!.slug} value={c!.slug}>
                    {c!.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Stan" s={S}>
            <select
              value={form.condition}
              onChange={(e) => set("condition", e.target.value)}
              className={S.select}
            >
              <option value="nowy">Nowy</option>
              <option value="uzywany">Używany</option>
              <option value="nieuzywany">Nieużywany</option>
            </select>
          </Field>
        </div>
      </section>

      {/* ============================================ */}
      {/* PARAMETERS */}
      {/* ============================================ */}
      <section className={S.section}>
        <h2 className={S.sectionHeader}>Parametry techniczne</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Field label="Moc [kW]" s={S}>
            <input
              value={form.power}
              onChange={(e) => set("power", e.target.value.replace(/\./g, ","))}
              className={S.input}
              placeholder="1,1"
            />
          </Field>
          <Field label="Obroty [obr/min]" s={S}>
            <input
              value={form.rpm}
              onChange={(e) => set("rpm", e.target.value.replace(/\./g, ","))}
              className={S.input}
              placeholder="2900"
            />
          </Field>
          <Field label="Waga [kg] *" s={S}>
            <input
              value={form.weight}
              onChange={(e) => set("weight", e.target.value)}
              className={S.input}
              type="number"
              step="0.1"
              min="0.1"
              required
            />
          </Field>
          <Field label="Śr. wału [mm]" s={S}>
            <input
              value={form.shaftDiameter}
              onChange={(e) => set("shaftDiameter", e.target.value)}
              className={S.input}
              type="number"
              step="0.1"
            />
          </Field>
          <Field label="Śr. tulei [mm]" s={S}>
            <input
              value={form.sleeveDiameter}
              onChange={(e) => set("sleeveDiameter", e.target.value)}
              className={S.input}
              type="number"
              step="0.1"
            />
          </Field>
          <Field label="Zamek kołnierza [mm]" s={S}>
            <input
              value={form.flangeSize}
              onChange={(e) => set("flangeSize", e.target.value)}
              className={S.input}
              type="number"
              step="0.1"
            />
          </Field>
          <Field label="Otwory podział. [mm]" s={S}>
            <input
              value={form.flangeBoltCircle}
              onChange={(e) => set("flangeBoltCircle", e.target.value)}
              className={S.input}
              type="number"
              step="0.1"
            />
          </Field>
          <Field label="Wlk. mechaniczna" s={S}>
            <input
              value={form.mechanicalSize}
              onChange={(e) => set("mechanicalSize", e.target.value)}
              className={S.input}
              type="number"
            />
          </Field>
          <Field label="Rozstaw łap [mm]" s={S}>
            <input
              value={form.legSpacing}
              onChange={(e) => set("legSpacing", e.target.value)}
              className={S.input}
              placeholder="100 x 100"
            />
          </Field>
          <Field label="Typ rozruchu" s={S}>
            <select
              value={form.startType}
              onChange={(e) => set("startType", e.target.value)}
              className={S.select}
            >
              <option value="">Brak</option>
              <option value="bezpośredni - 230/400V">
                Bezpośredni 230/400V
              </option>
              <option value="bezpośredni - 220/380V">
                Bezpośredni 220/380V
              </option>
              <option value="gwiazda-trójkąt - 400/690V">Y/Δ 400/690V</option>
              <option value="gwiazda-trójkąt - 380/660V">Y/Δ 380/660V</option>
            </select>
          </Field>
        </div>

        {/* Checkboxes */}
        <div className="mt-5 flex flex-wrap gap-6">
          <label className={S.checkLabel}>
            <input
              type="checkbox"
              checked={form.hasBreak}
              onChange={(e) => set("hasBreak", e.target.checked)}
              className={S.checkbox}
            />
            Hamulec
          </label>
          <label className={S.checkLabel}>
            <input
              type="checkbox"
              checked={form.hasEx}
              onChange={(e) => set("hasEx", e.target.checked)}
              className={S.checkbox}
            />
            Wykonanie Ex
          </label>
          <label className={S.checkLabel}>
            <input
              type="checkbox"
              checked={form.hasForeignCooling}
              onChange={(e) => set("hasForeignCooling", e.target.checked)}
              className={S.checkbox}
            />
            Obce chłodzenie
          </label>
        </div>

        {/* Custom parameters */}
        <div className="mt-5 border-t border-[#2d3348] pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#8b8fa3]">
              Dodatkowe parametry
            </span>
            <button
              type="button"
              onClick={() =>
                setCustomParams([...customParams, { name: "", value: "" }])
              }
              className={S.btnAdd}
            >
              <Plus className="h-3 w-3" /> Dodaj
            </button>
          </div>
          {customParams.map((p, i) => (
            <div key={i} className="mt-2 flex gap-2">
              <input
                value={p.name}
                onChange={(e) => {
                  const next = [...customParams];
                  next[i].name = e.target.value;
                  setCustomParams(next);
                }}
                className={S.input + " flex-1"}
                placeholder="Nazwa"
              />
              <input
                value={p.value}
                onChange={(e) => {
                  const next = [...customParams];
                  next[i].value = e.target.value;
                  setCustomParams(next);
                }}
                className={S.input + " flex-1"}
                placeholder="Wartość"
              />
              <button
                type="button"
                onClick={() =>
                  setCustomParams(customParams.filter((_, j) => j !== i))
                }
                className={S.btnDanger}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================ */}
      {/* IMAGES */}
      {/* ============================================ */}
      <section className={S.section}>
        <h2 className={S.sectionHeader}>Zdjęcia</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Main image */}
          <div>
            <label className={S.label}>Zdjęcie główne</label>
            <input
              ref={mainImageRef}
              type="file"
              accept="image/*"
              onChange={handleMainImage}
              className="hidden"
            />
            {mainImage ? (
              <div className="group relative inline-block">
                <img src={mainImage} alt="Główne" className={S.imageThumb} />
                <button
                  type="button"
                  onClick={() => setMainImage("")}
                  className="absolute -right-2 -top-2 rounded-full bg-[#ef4444] p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => mainImageRef.current?.click()}
                disabled={uploadingMain}
                className={S.uploadZone + " h-32 w-32"}
              >
                {uploadingMain ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Upload className="h-6 w-6" />
                )}
              </button>
            )}
          </div>

          {/* Gallery */}
          <div>
            <label className={S.label}>Galeria (max 3)</label>
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleGallery}
              className="hidden"
            />
            <div className="flex gap-2">
              {galleryImages.map((url, i) => (
                <div key={url} className="group relative">
                  <img
                    src={url}
                    alt={`Galeria ${i + 1}`}
                    className={S.imageThumbSm}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setGalleryImages(galleryImages.filter((_, j) => j !== i))
                    }
                    className="absolute -right-1 -top-1 rounded-full bg-[#ef4444] p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {galleryImages.length < 3 && (
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  disabled={uploadingGallery}
                  className={S.uploadZone + " h-24 w-24"}
                >
                  {uploadingGallery ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Plus className="h-5 w-5" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* PDF datasheets */}
        <div className="mt-4">
          <label className={S.label}>Karty katalogowe (PDF)</label>
          <input
            ref={pdfRef}
            type="file"
            accept=".pdf"
            multiple
            onChange={handlePdfUpload}
            className="hidden"
          />
          <div className="flex flex-wrap items-center gap-2">
            {dataSheets.map((url, i) => (
              <div key={i} className={S.pdfBadge}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#818cf8] hover:underline"
                >
                  PDF #{i + 1}
                </a>
                <button
                  type="button"
                  onClick={() =>
                    setDataSheets(dataSheets.filter((_, j) => j !== i))
                  }
                  className="text-[#ef4444] hover:text-[#f87171]"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => pdfRef.current?.click()}
              className={S.btnAdd}
            >
              + Dodaj PDF
            </button>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* PRICING + STOCK */}
      {/* ============================================ */}
      <section className={S.section}>
        <h2 className={S.sectionHeader}>Cena i magazyn</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Field label="Cena sklepowa [PLN] *" s={S}>
            <input
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
              className={S.input}
              type="number"
              step="0.01"
              min="0.01"
              required
            />
          </Field>
          <Field label="Stan magazynowy *" s={S}>
            <input
              value={form.stock}
              onChange={(e) => set("stock", e.target.value)}
              className={S.input}
              type="number"
              min="0"
              required
            />
          </Field>
        </div>
      </section>

      {/* ============================================ */}
      {/* DESCRIPTION */}
      {/* ============================================ */}
      <section className={S.section}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className={S.sectionHeader + " !mb-0"}>Opis produktu</h2>
          <button
            type="button"
            onClick={generateDescription}
            disabled={generatingDesc}
            className={S.btnAI}
          >
            {generatingDesc ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Wand2 className="h-3 w-3" />
            )}
            Wygeneruj opis AI
          </button>
        </div>
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={8}
          className={S.textarea}
          placeholder="Opis produktu (każda linia = osobny akapit)"
        />
      </section>

      {/* ============================================ */}
      {/* ALLEGRO SECTION */}
      {/* ============================================ */}
      <section className="rounded-lg border border-[#2d3348] bg-[#1a1d27] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAllegroSection(!showAllegroSection)}
          className={S.allegroHeader}
        >
          <div className="flex items-center gap-2.5">
            <div className={S.allegroIcon}>A</div>
            <span className="text-sm font-semibold text-[#e4e6ef]">
              Allegro
            </span>
            {allegroConnected ? (
              <span className="rounded bg-[#166534]/30 px-2 py-0.5 text-[10px] font-semibold text-[#4ade80]">
                POŁĄCZONO
              </span>
            ) : (
              <span className="rounded bg-[#7f1d1d]/30 px-2 py-0.5 text-[10px] font-semibold text-[#f87171]">
                NIEPOŁĄCZONO
              </span>
            )}
          </div>
          {showAllegroSection ? (
            <ChevronUp className="h-4 w-4 text-[#8b8fa3]" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[#8b8fa3]" />
          )}
        </button>

        {showAllegroSection && (
          <div className="border-t border-[#2d3348] px-5 pb-5 pt-4">
            {!allegroConnected ? (
              <p className="text-sm text-[#8b8fa3]">
                Połącz z Allegro w{" "}
                <a
                  href="/admin/allegro"
                  className="text-[#818cf8] hover:underline"
                >
                  panelu Allegro
                </a>
                , aby móc dodawać oferty.
              </p>
            ) : !isAllegroSupported ? (
              <div className="rounded-md border border-[#f59e0b]/30 bg-[#f59e0b]/10 p-3 text-sm text-[#fbbf24]">
                Allegro dostępne tylko dla: silniki elektryczne (wszystkie
                podkategorie) i motoreduktory.
              </div>
            ) : (
              <div className="space-y-4">
                <label className={S.checkLabel}>
                  <input
                    type="checkbox"
                    checked={form.addToAllegro}
                    onChange={(e) => set("addToAllegro", e.target.checked)}
                    className={S.checkbox}
                  />
                  <span className="font-medium">Dodaj również na Allegro</span>
                </label>

                {form.addToAllegro && (
                  <div className="ml-6 space-y-3 border-l-2 border-[#f59e0b]/30 pl-4">
                    <Field label="Cena Allegro [PLN] (opcjonalnie)" s={S}>
                      <input
                        value={form.allegroPrice}
                        onChange={(e) => set("allegroPrice", e.target.value)}
                        className={S.input}
                        type="number"
                        step="0.01"
                        placeholder="Domyślnie = cena sklepowa"
                      />
                    </Field>
                    <Field label="Model (wymagane na Allegro) *" s={S}>
                      <input
                        value={form.allegroModel}
                        onChange={(e) => set("allegroModel", e.target.value)}
                        className={S.input}
                        placeholder="np. DRS71M4"
                        required={form.addToAllegro}
                      />
                    </Field>
                    <Field label="Opis Allegro (opcjonalnie)" s={S}>
                      <textarea
                        value={form.allegroDescription}
                        onChange={(e) =>
                          set("allegroDescription", e.target.value)
                        }
                        className={S.textarea}
                        rows={3}
                        placeholder="Domyślnie = główny opis"
                      />
                    </Field>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ============================================ */}
      {/* SUBMIT */}
      {/* ============================================ */}
      <div className="flex items-center justify-between pt-2 pb-8">
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem(STORAGE_KEY);
            setForm(DEFAULT_FORM);
            setMainImage("");
            setGalleryImages([]);
            setCustomParams([]);
            setDataSheets([]);
            setSelectedCategory("");
            setMfgSearch("");
            setMessage(null);
          }}
          className={S.btnGhost}
        >
          Wyczyść formularz
        </button>

        <button type="submit" disabled={submitting} className={S.btnPrimary}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Dodawanie...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Dodaj produkt
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// ---- Field helper ----
function Field({
  label,
  children,
  s,
}: {
  label: string;
  children: React.ReactNode;
  s: Record<string, string>;
}) {
  return (
    <div>
      <label className={s.label}>{label}</label>
      {children}
    </div>
  );
}
