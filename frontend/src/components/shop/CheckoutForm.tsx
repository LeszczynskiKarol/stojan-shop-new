// frontend/src/components/shop/CheckoutForm.tsx
// Formularz zamówienia - React island for Astro
// Czyta produkty z cart (stojan_cart), wysyła do /api/orders
import { useState, useEffect, useCallback } from "react";
import { cart, type CartItem } from "@/lib/cart";

const API_URL =
  (import.meta as any).env?.PUBLIC_API_URL || "http://localhost:4000";

const COND_LABEL: Record<string, string> = {
  nowy: "Nowy",
  uzywany: "Używany",
  nieuzywany: "Nieużywany",
};

// ============================================
// FORM PERSISTENCE — sessionStorage
// ============================================
const FORM_STORAGE_KEY = "stojan_checkout_form";

interface FormData {
  isCompany: boolean;
  companyName: string;
  nip: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  postalCode: string;
  city: string;
  notes: string;
  wantsInvoice: boolean;
  diffShipping: boolean;
  shipStreet: string;
  shipPostal: string;
  shipCity: string;
  paymentMethod: "prepaid" | "cod";
}

function saveFormData(data: FormData) {
  try {
    sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function loadFormData(): FormData | null {
  try {
    const raw = sessionStorage.getItem(FORM_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearFormData() {
  try {
    sessionStorage.removeItem(FORM_STORAGE_KEY);
  } catch {}
}

export function CheckoutForm() {
  // === STATE ===
  const [items, setItems] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"prepaid" | "cod">(
    "prepaid",
  );
  const [shippingCosts, setShippingCosts] = useState({ prepaid: 0, cod: 0 });
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [stripeCancel, setStripeCancel] = useState(false);

  // Form
  const [isCompany, setIsCompany] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [nip, setNip] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");
  const [wantsInvoice, setWantsInvoice] = useState(false);
  const [diffShipping, setDiffShipping] = useState(false);
  const [shipStreet, setShipStreet] = useState("");
  const [shipPostal, setShipPostal] = useState("");
  const [shipCity, setShipCity] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // === LOAD FROM CART + RESTORE FORM ===
  useEffect(() => {
    const cartItems = cart.getItems();
    if (cartItems.length === 0) {
      window.location.href = "/";
      return;
    }
    setItems(cartItems);

    // Detect stripe cancel
    const params = new URLSearchParams(window.location.search);
    if (params.get("stripe_cancel") === "true") {
      setStripeCancel(true);
      // Clean URL without reload
      window.history.replaceState({}, "", "/checkout");
    }

    // Restore saved form data
    const saved = loadFormData();
    if (saved) {
      setIsCompany(saved.isCompany);
      setCompanyName(saved.companyName || "");
      setNip(saved.nip || "");
      setFirstName(saved.firstName || "");
      setLastName(saved.lastName || "");
      setEmail(saved.email || "");
      setPhone(saved.phone || "");
      setStreet(saved.street || "");
      setPostalCode(saved.postalCode || "");
      setCity(saved.city || "");
      setNotes(saved.notes || "");
      setWantsInvoice(saved.wantsInvoice || false);
      setDiffShipping(saved.diffShipping || false);
      setShipStreet(saved.shipStreet || "");
      setShipPostal(saved.shipPostal || "");
      setShipCity(saved.shipCity || "");
      if (saved.paymentMethod) setPaymentMethod(saved.paymentMethod);
    }
  }, []);

  // === SAVE FORM on every change ===
  useEffect(() => {
    // Don't save on initial empty state
    if (items.length === 0) return;
    saveFormData({
      isCompany,
      companyName,
      nip,
      firstName,
      lastName,
      email,
      phone,
      street,
      postalCode,
      city,
      notes,
      wantsInvoice,
      diffShipping,
      shipStreet,
      shipPostal,
      shipCity,
      paymentMethod,
    });
  }, [
    isCompany,
    companyName,
    nip,
    firstName,
    lastName,
    email,
    phone,
    street,
    postalCode,
    city,
    notes,
    wantsInvoice,
    diffShipping,
    shipStreet,
    shipPostal,
    shipCity,
    paymentMethod,
    items,
  ]);

  // Sync cart changes
  useEffect(() => {
    const handler = () => {
      const updated = cart.getItems();
      if (updated.length === 0) {
        window.location.href = "/";
        return;
      }
      setItems(updated);
    };
    window.addEventListener("cart-updated", handler);
    return () => window.removeEventListener("cart-updated", handler);
  }, []);

  // === DERIVED ===
  const totalWeight = items.reduce(
    (s, i) => s + (i.weight || 0) * i.quantity,
    0,
  );

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const totalCount = items.reduce((s, i) => s + i.quantity, 0);

  // === SHIPPING COSTS ===
  const calculateShipping = useCallback(async () => {
    if (items.length === 0) return;
    setIsCalculating(true);
    try {
      const apiItems = items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      }));
      const fetchCost = async (method: string) => {
        const res = await fetch(`${API_URL}/api/orders/calculate-shipping`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: apiItems, paymentMethod: method }),
        });
        if (!res.ok) return 0;
        const json = await res.json();
        return json.data?.cost ?? 0;
      };
      const prepaid = await fetchCost("prepaid");
      const cod = totalWeight <= 575 ? await fetchCost("cod") : 0;
      setShippingCosts({ prepaid, cod });
    } catch {
      setShippingCosts({ prepaid: 0, cod: 0 });
    } finally {
      setIsCalculating(false);
    }
  }, [items, totalWeight]);

  useEffect(() => {
    calculateShipping();
  }, [calculateShipping]);

  // === HELPERS ===
  const formatPostal = (v: string) => {
    const d = v.replace(/\D/g, "");
    return d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2, 5)}` : d;
  };
  const formatNip = (v: string) => v.replace(/\D/g, "").slice(0, 10);
  const fmt = (v: number) =>
    v.toLocaleString("pl-PL", {
      minimumFractionDigits: v % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });

  const updateItemQuantity = (productId: string, qty: number) => {
    cart.updateQuantity(productId, qty);
  };

  const removeItem = (productId: string) => {
    cart.remove(productId);
  };

  // === VALIDATE ===
  const validate = () => {
    const e: Record<string, string> = {};
    if (isCompany) {
      if (!companyName.trim()) e.companyName = "Podaj nazwę firmy";
      if (wantsInvoice && nip.length !== 10) e.nip = "NIP musi mieć 10 cyfr";
    } else {
      if (!firstName.trim()) e.firstName = "Podaj imię";
      if (!lastName.trim()) e.lastName = "Podaj nazwisko";
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      e.email = "Podaj poprawny email";
    if (!phone.trim() || phone.replace(/\D/g, "").length < 9)
      e.phone = "Podaj numer telefonu";
    if (!street.trim()) e.street = "Podaj adres";
    if (!/^\d{2}-\d{3}$/.test(postalCode)) e.postalCode = "Format: 00-000";
    if (!city.trim()) e.city = "Podaj miejscowość";
    if (diffShipping) {
      if (!shipStreet.trim()) e.shipStreet = "Podaj adres dostawy";
      if (!/^\d{2}-\d{3}$/.test(shipPostal)) e.shipPostal = "Format: 00-000";
      if (!shipCity.trim()) e.shipCity = "Podaj miejscowość";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // === SUBMIT ===
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0 || !validate()) return;

    setIsSubmitting(true);
    setSubmitError("");

    const shippingCost =
      paymentMethod === "cod" ? shippingCosts.cod : shippingCosts.prepaid;
    const total = subtotal + shippingCost;

    try {
      const res = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            name: i.name,
            price: i.price,
            image: i.image,
            weight: (i as any).weight || 0,
            slug: i.productSlug,
            categorySlug: i.categorySlug,
          })),
          shipping: {
            firstName: isCompany ? companyName : firstName,
            lastName: isCompany ? "-" : lastName,
            companyName: isCompany ? companyName : undefined,
            nip: wantsInvoice ? nip : undefined,
            email,
            phone,
            street,
            postalCode,
            city,
            differentShippingAddress: diffShipping,
            shippingStreet: diffShipping ? shipStreet : street,
            shippingPostalCode: diffShipping ? shipPostal : postalCode,
            shippingCity: diffShipping ? shipCity : city,
            notes: notes || undefined,
          },
          subtotal,
          shippingCost,
          total,
          totalWeight,
          paymentMethod,
          returnUrl: window.location.href,
          visitorId: localStorage.getItem("stojan_vid") || undefined,
        }),
      });

      const result = await res.json();
      if (!result.success)
        throw new Error(result.error || "Błąd tworzenia zamówienia");

      if (paymentMethod === "prepaid" && result.data.checkoutUrl) {
        // ✅ NIE czyścimy koszyka — zostanie wyczyszczony na stronie sukcesu
        // Dane formularza też zostawiamy w sessionStorage na wypadek cancel
        window.location.href = result.data.checkoutUrl;
      } else {
        // COD — czyścimy koszyk i dane formularza od razu
        cart.clear();
        clearFormData();
        window.location.href = `/checkout/sukces?order_id=${result.data.order.id}`;
      }
    } catch (err: any) {
      setSubmitError(err.message || "Wystąpił błąd");
    } finally {
      setIsSubmitting(false);
    }
  };

  // === LOADING ===
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const shippingCost =
    paymentMethod === "cod" ? shippingCosts.cod : shippingCosts.prepaid;
  const total = subtotal + shippingCost;

  // === RENDER ===
  return (
    <form
      onSubmit={handleSubmit}
      className="grid lg:grid-cols-[1fr_380px] gap-8"
    >
      {/* ==================== LEFT: FORM ==================== */}
      <div className="space-y-6">
        {/* Stripe cancel info */}
        {stripeCancel && (
          <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm">
            Płatność została anulowana. Twoje dane zostały zachowane — możesz
            spróbować ponownie.
          </div>
        )}

        {/* Payment method */}
        <Section title="Sposób płatności">
          <div className="grid sm:grid-cols-2 gap-3">
            <RadioCard
              selected={paymentMethod === "prepaid"}
              onClick={() => setPaymentMethod("prepaid")}
              label="Płatność online"
              desc="BLIK, przelew, karta, Google Pay, Apple Pay"
            />
            {totalWeight <= 575 && (
              <RadioCard
                selected={paymentMethod === "cod"}
                onClick={() => setPaymentMethod("cod")}
                label="Za pobraniem"
                desc="Gotówka przy odbiorze"
              />
            )}
          </div>
        </Section>

        {/* Contact */}
        <Section title="Dane kontaktowe">
          <div className="flex gap-2 mb-4">
            <TabButton active={!isCompany} onClick={() => setIsCompany(false)}>
              Osoba prywatna
            </TabButton>
            <TabButton active={isCompany} onClick={() => setIsCompany(true)}>
              Firma
            </TabButton>
          </div>

          <div className="space-y-3">
            {isCompany ? (
              <>
                <Field
                  label="Nazwa firmy *"
                  value={companyName}
                  onChange={setCompanyName}
                  error={errors.companyName}
                />
                <label className="flex items-center gap-2 text-sm cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={wantsInvoice}
                    onChange={(e) => setWantsInvoice(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-[hsl(var(--muted-foreground))]">
                    Faktura VAT
                  </span>
                </label>
                {wantsInvoice && (
                  <Field
                    label="NIP *"
                    value={nip}
                    onChange={(v) => setNip(formatNip(v))}
                    error={errors.nip}
                    maxLength={10}
                  />
                )}
              </>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                <Field
                  label="Imię *"
                  value={firstName}
                  onChange={setFirstName}
                  error={errors.firstName}
                />
                <Field
                  label="Nazwisko *"
                  value={lastName}
                  onChange={setLastName}
                  error={errors.lastName}
                />
              </div>
            )}
            <Field
              label="Email *"
              value={email}
              onChange={setEmail}
              error={errors.email}
              type="email"
            />
            <Field
              label="Telefon (dla kuriera do doręczenia) *"
              value={phone}
              onChange={setPhone}
              error={errors.phone}
              type="tel"
            />
          </div>
        </Section>

        {/* Address */}
        <Section title="Adres">
          <div className="space-y-3">
            <div className="grid sm:grid-cols-[140px_1fr] gap-3">
              <Field
                label="Kod pocztowy *"
                value={postalCode}
                onChange={(v) => setPostalCode(formatPostal(v))}
                error={errors.postalCode}
                maxLength={6}
                placeholder="00-000"
              />
              <Field
                label="Miejscowość *"
                value={city}
                onChange={setCity}
                error={errors.city}
              />
            </div>
            <Field
              label="Ulica i numer *"
              value={street}
              onChange={setStreet}
              error={errors.street}
              placeholder="np. Kwiatowa 15/3"
            />

            <label className="flex items-center gap-2 text-sm cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={diffShipping}
                onChange={(e) => setDiffShipping(e.target.checked)}
                className="rounded"
              />
              <span className="text-[hsl(var(--muted-foreground))]">
                Inny adres dostawy
              </span>
            </label>

            {diffShipping && (
              <div className="space-y-3 pt-3 border-t border-[hsl(var(--border))]">
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                  Adres dostawy
                </p>
                <div className="grid sm:grid-cols-[140px_1fr] gap-3">
                  <Field
                    label="Kod pocztowy *"
                    value={shipPostal}
                    onChange={(v) => setShipPostal(formatPostal(v))}
                    error={errors.shipPostal}
                    maxLength={6}
                    placeholder="00-000"
                  />
                  <Field
                    label="Miejscowość *"
                    value={shipCity}
                    onChange={setShipCity}
                    error={errors.shipCity}
                  />
                </div>
                <Field
                  label="Ulica i numer *"
                  value={shipStreet}
                  onChange={setShipStreet}
                  error={errors.shipStreet}
                />
              </div>
            )}
          </div>
        </Section>

        {/* Notes */}
        <Section title="Uwagi do zamówienia">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Opcjonalne uwagi..."
            className="w-full px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
          />
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            {notes.length}/500
          </p>
        </Section>

        {submitError && (
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
            {submitError}
          </div>
        )}

        <div className="lg:hidden">
          <SubmitButton
            isSubmitting={isSubmitting}
            total={total}
            fmt={fmt}
            paymentMethod={paymentMethod}
          />
        </div>
      </div>

      {/* ==================== RIGHT: SUMMARY ==================== */}
      <div className="lg:order-last">
        <div className="lg:sticky lg:top-20 space-y-5">
          {/* Products */}
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
            <h2 className="font-semibold text-[hsl(var(--foreground))] mb-4">
              Moje zamówienie ({totalCount}{" "}
              {totalCount === 1
                ? "produkt"
                : totalCount < 5
                  ? "produkty"
                  : "produktów"}
              )
            </h2>

            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.productId} className="flex gap-3">
                  {item.image && (
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-[hsl(var(--accent))] shrink-0">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-contain p-1"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <a
                      href={`/${item.categorySlug}/${item.productSlug}`}
                      className="text-sm font-medium text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] transition-colors line-clamp-2"
                    >
                      {item.name}
                    </a>
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                      {item.manufacturer &&
                        item.manufacturer !== "silnik" &&
                        `${item.manufacturer} · `}
                      {COND_LABEL[item.condition] || item.condition}
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      {/* Quantity controls */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (item.quantity <= 1) removeItem(item.productId);
                            else
                              updateItemQuantity(
                                item.productId,
                                item.quantity - 1,
                              );
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] transition-colors text-xs"
                        >
                          {item.quantity <= 1 ? "✕" : "−"}
                        </button>
                        <span className="w-7 text-center font-medium text-xs">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateItemQuantity(
                              item.productId,
                              item.quantity + 1,
                            )
                          }
                          className="w-7 h-7 flex items-center justify-center rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] transition-colors text-xs"
                          disabled={item.quantity >= item.stock}
                        >
                          +
                        </button>
                      </div>

                      <span className="text-sm font-bold text-[hsl(var(--primary))]">
                        {fmt(item.price * item.quantity)} zł
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-[hsl(var(--muted-foreground))]">
                Produkty
              </span>
              <span>{fmt(subtotal)} zł</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[hsl(var(--muted-foreground))]">
                Dostawa
              </span>
              <span>
                {isCalculating
                  ? "..."
                  : shippingCost > 0
                    ? `${fmt(shippingCost)} zł`
                    : "–"}
              </span>
            </div>
            <div className="flex justify-between pt-3 border-t border-[hsl(var(--border))]">
              <span className="font-semibold">Razem</span>
              <span className="text-xl font-bold text-[hsl(var(--primary))]">
                {fmt(total)} zł
              </span>
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Cena zawiera 23% VAT
            </p>
          </div>

          {/* Submit desktop */}
          <div className="hidden lg:block">
            <SubmitButton
              isSubmitting={isSubmitting}
              total={total}
              fmt={fmt}
              paymentMethod={paymentMethod}
            />
          </div>

          <p className="text-xs text-[hsl(var(--muted-foreground))] text-center">
            Klikając „Zamawiam", akceptuję{" "}
            <a
              href="/regulamin-sklepu"
              className="underline hover:text-[hsl(var(--foreground))]"
            >
              regulamin
            </a>{" "}
            i{" "}
            <a
              href="/polityka-prywatnosci"
              className="underline hover:text-[hsl(var(--foreground))]"
            >
              politykę prywatności
            </a>
            .
          </p>
        </div>
      </div>
    </form>
  );
}

// ============================================
// Sub-components
// ============================================
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
      <h2 className="font-semibold text-[hsl(var(--foreground))] mb-4">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  type = "text",
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        className={`w-full h-10 px-3 rounded-lg border text-sm bg-[hsl(var(--background))] text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-colors ${
          error
            ? "border-red-400 dark:border-red-600"
            : "border-[hsl(var(--border))]"
        }`}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function RadioCard({
  selected,
  onClick,
  label,
  desc,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 p-4 rounded-lg border-2 text-left transition-all ${
        selected
          ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5"
          : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/30"
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
          selected
            ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]"
            : "border-[hsl(var(--muted-foreground))]"
        }`}
      >
        {selected && <div className="w-2 h-2 bg-white rounded-full" />}
      </div>
      <div>
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-[hsl(var(--muted-foreground))]">
          {desc}
        </div>
      </div>
    </button>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
          : "bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]"
      }`}
    >
      {children}
    </button>
  );
}

function SubmitButton({
  isSubmitting,
  total,
  fmt,
  paymentMethod,
}: {
  isSubmitting: boolean;
  total: number;
  fmt: (v: number) => string;
  paymentMethod: "prepaid" | "cod";
}) {
  return (
    <button
      type="submit"
      disabled={isSubmitting}
      className="w-full h-14 rounded-xl font-bold text-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-all disabled:opacity-50 active:scale-[0.98]"
    >
      {isSubmitting ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          Przetwarzanie...
        </span>
      ) : paymentMethod === "prepaid" ? (
        "Kupuję i płacę →"
      ) : (
        "Kupuję za pobraniem →"
      )}
    </button>
  );
}
