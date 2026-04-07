// frontend/src/components/admin/OrderDetailsDialog.tsx
// Style: inline styles z admin CSS vars (--bg, --bg-card, --text, --text-muted, --border, --primary)
// ZERO Tailwind, ZERO hsl(), ZERO bg-red-50/bg-yellow-50
import { useState } from "react";
import type { Order } from "./AdminOrders";
import { CourierSelectModal } from "./CourierSelectModal";

const API = (import.meta as any).env?.PUBLIC_API_URL || "http://localhost:4000";

interface OrderDetailsDialogProps {
  order: Order;
  onClose: () => void;
  onStatusChange?: (status: string) => void;
}

const fmt = (v: number) =>
  Number(v).toLocaleString("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

export function OrderDetailsDialog({
  order,
  onClose,
  onStatusChange,
}: OrderDetailsDialogProps) {
  const [shipping, setShipping] = useState(false);
  const [wnModal, setWnModal] = useState<{
    order: Order;
    offers: any[];
  } | null>(null);
  const [wnLoading, setWnLoading] = useState(false);

  const [toast, setToast] = useState<{
    msg: string;
    type: "ok" | "err";
  } | null>(null);
  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Invoice/document upload state
  const [invoiceUrls, setInvoiceUrls] = useState<string[]>(
    order.invoiceUrls || [],
  );
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleUpload = async (files: FileList) => {
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append("file", f));

      const res = await fetch(`${API}/api/orders/${order.id}/upload-invoice`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Błąd uploadu");

      setInvoiceUrls(json.data.invoiceUrls);
    } catch (err: any) {
      alert(err.message || "Błąd uploadu dokumentów");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (url: string, index: number) => {
    if (!confirm("Czy na pewno chcesz usunąć ten dokument?")) return;
    setDeleting(url);
    try {
      const updatedUrls = invoiceUrls.filter((_, i) => i !== index);
      const res = await fetch(`${API}/api/orders/${order.id}/invoices`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceUrls: updatedUrls }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Błąd usuwania");
      setInvoiceUrls(updatedUrls);
    } catch (err: any) {
      alert(err.message || "Błąd usuwania dokumentu");
    } finally {
      setDeleting(null);
    }
  };

  const formatFileName = (url: string) => {
    const name = url.split("/").pop() || "";
    return name.length > 24 ? name.substring(0, 24) + "..." : name;
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,.7)",
          zIndex: 9000,
          animation: "odFadeIn .15s ease",
        }}
      />

      {/* Dialog */}
      <div
        style={{
          position: "fixed",
          inset: "24px",
          zIndex: 9001,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--bg-card, #1a1d27)",
          border: "1px solid var(--border, #2d3348)",
          borderRadius: "12px",
          boxShadow: "0 25px 60px rgba(0,0,0,.6)",
          color: "var(--text, #e4e6ef)",
          animation: "odSlideUp .25s ease",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            flexShrink: 0,
            padding: "16px 24px",
            borderBottom: "1px solid var(--border, #2d3348)",
            background: "var(--bg-card, #1a1d27)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "var(--text, #e4e6ef)",
                margin: 0,
              }}
            >
              Szczegóły zamówienia #{order.orderNumber}
            </h2>
            <div
              style={{
                display: "flex",
                gap: "16px",
                marginTop: "4px",
                flexWrap: "wrap",
                fontSize: "13px",
              }}
            >
              <span style={{ color: "var(--text-muted, #8b8fa3)" }}>
                ID: {order.id}
              </span>
              <span
                style={{ color: "var(--primary, #6366f1)", fontWeight: 600 }}
              >
                Produkty: {fmt(order.subtotal)} + Dostawa:{" "}
                {fmt(order.shippingCost)} = {fmt(order.total)}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted, #8b8fa3)",
              cursor: "pointer",
              padding: "8px",
              borderRadius: "6px",
              fontSize: "18px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          <div
            style={{
              maxWidth: "900px",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
            }}
          >
            {/* PRODUKTY */}
            <div>
              <h4 style={h4Style}>Zamówione produkty</h4>
              {order.items.map((item, idx) => (
                <div key={idx} style={cardStyle}>
                  <div
                    style={{
                      display: "flex",
                      gap: "16px",
                      alignItems: "flex-start",
                    }}
                  >
                    {(item.mainImage || item.image) && (
                      <img
                        src={item.mainImage || item.image}
                        alt={item.name}
                        style={{
                          width: "80px",
                          height: "80px",
                          objectFit: "cover",
                          borderRadius: "6px",
                          border: "1px solid var(--border, #2d3348)",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                        onClick={() => {
                          if (item.categorySlug && item.slug)
                            window.open(
                              `/${item.categorySlug}/${item.slug}`,
                              "_blank",
                            );
                        }}
                      />
                    )}
                    <div>
                      <div
                        style={{
                          fontWeight: 600,
                          marginBottom: "8px",
                          color: "var(--text, #e4e6ef)",
                        }}
                      >
                        {item.name}
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "var(--text-muted, #8b8fa3)",
                          display: "flex",
                          gap: "16px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span>
                          Ilość:{" "}
                          <strong style={{ color: "var(--text, #e4e6ef)" }}>
                            {item.quantity} szt.
                          </strong>
                        </span>
                        <span>
                          Cena:{" "}
                          <strong style={{ color: "var(--text, #e4e6ef)" }}>
                            {fmt(item.price)}
                          </strong>
                        </span>
                        {item.weight && (
                          <span>
                            Waga:{" "}
                            <strong style={{ color: "var(--text, #e4e6ef)" }}>
                              {item.weight} kg
                            </strong>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* DANE KLIENTA / FAKTURA */}
            <div style={cardStyle}>
              <h4 style={h4Style}>
                💳 {order.shipping.nip ? "DANE DO FAKTURY VAT" : "DANE KLIENTA"}
              </h4>

              {!order.shipping.nip ? (
                <>
                  <div style={bannerWarning}>
                    <span>⚠️ Klient nie zaznaczył opcji faktury VAT</span>
                    <span
                      style={{
                        marginLeft: "auto",
                        background: "#1e3a5f",
                        color: "#60a5fa",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                      }}
                    >
                      {order.paymentMethod === "prepaid"
                        ? "💳 Online"
                        : "📦 Pobranie"}
                    </span>
                  </div>
                  <div style={linesStyle}>
                    <div style={{ fontWeight: 600 }}>
                      {order.shipping.firstName} {order.shipping.lastName}
                    </div>
                    <div>{order.shipping.street}</div>
                    <div>
                      {order.shipping.postalCode} {order.shipping.city}
                    </div>
                  </div>
                  <div style={hrStyle} />
                  <div style={labelStyle}>Dane kontaktowe</div>
                  <div style={linesStyle}>
                    <div>
                      <strong>Email:</strong> {order.shipping.email}
                    </div>
                    <div>
                      <strong>Tel:</strong> {order.shipping.phone}
                    </div>
                  </div>
                  <div style={hrStyle} />
                  <div style={labelStyle}>Sposób płatności</div>
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>
                    {order.paymentMethod === "prepaid"
                      ? "💳 Płatność online"
                      : "📦 Płatność przy odbiorze"}
                  </div>
                </>
              ) : (
                <>
                  <div style={bannerSuccess}>
                    ✓ Klient zaznaczył fakturę VAT
                  </div>
                  <div style={linesStyle}>
                    {order.shipping.companyName ? (
                      <>
                        <div
                          style={{
                            fontWeight: 600,
                            color: "var(--primary, #6366f1)",
                          }}
                        >
                          {order.shipping.companyName}
                        </div>
                        <div style={{ fontWeight: 600, color: "#f87171" }}>
                          NIP: {order.shipping.nip}
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontWeight: 600 }}>
                          {order.shipping.firstName} {order.shipping.lastName}
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--text-muted, #8b8fa3)",
                          }}
                        >
                          (osoba prywatna)
                        </div>
                        <div style={{ fontWeight: 600, color: "#f87171" }}>
                          NIP: {order.shipping.nip}
                        </div>
                      </>
                    )}
                  </div>
                  <div style={hrStyle} />
                  <div style={labelStyle}>Adres do faktury</div>
                  <div style={linesStyle}>
                    <div>{order.shipping.street}</div>
                    <div>
                      {order.shipping.postalCode} {order.shipping.city}
                    </div>
                  </div>
                  <div style={hrStyle} />
                  <div style={labelStyle}>Dane kontaktowe</div>
                  <div style={linesStyle}>
                    <div>
                      <strong>Email:</strong> {order.shipping.email}
                    </div>
                    <div>
                      <strong>Tel:</strong> {order.shipping.phone}
                    </div>
                  </div>
                  <div style={hrStyle} />
                  <div style={labelStyle}>Sposób płatności</div>
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>
                    {order.paymentMethod === "prepaid"
                      ? "💳 Płatność online"
                      : "📦 Płatność przy odbiorze"}
                  </div>
                </>
              )}

              {/* Podsumowanie */}
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px",
                  background: "var(--bg, #0f1117)",
                  borderRadius: "6px",
                  border: "1px solid var(--border, #2d3348)",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                  Wartość zamówienia:
                </div>
                <div style={{ fontSize: "13px" }}>
                  <div style={sumRowStyle}>
                    <span style={{ color: "var(--text-muted, #8b8fa3)" }}>
                      Produkty:
                    </span>
                    <span>{fmt(order.subtotal)}</span>
                  </div>
                  <div style={sumRowStyle}>
                    <span style={{ color: "var(--text-muted, #8b8fa3)" }}>
                      Dostawa:
                    </span>
                    <span>{fmt(order.shippingCost)}</span>
                  </div>
                  <div
                    style={{
                      ...sumRowStyle,
                      paddingTop: "8px",
                      borderTop: "1px solid var(--border, #2d3348)",
                      marginTop: "6px",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Razem:</span>
                    <span
                      style={{
                        fontSize: "18px",
                        fontWeight: 700,
                        color: "var(--primary, #6366f1)",
                      }}
                    >
                      {fmt(order.total)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ADRES DOSTAWY */}
            <div
              style={{
                border: "2px solid #991b1b",
                borderRadius: "8px",
                padding: "16px",
                background: "rgba(127,29,29,.15)",
              }}
            >
              <h4 style={{ ...h4Style, color: "#f87171" }}>🚚 ADRES DOSTAWY</h4>
              <div style={linesStyle}>
                <div style={{ fontWeight: 600 }}>
                  {order.shipping.firstName} {order.shipping.lastName}
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
              </div>
              <div
                style={{
                  marginTop: "12px",
                  paddingTop: "12px",
                  borderTop: "1px solid #991b1b",
                }}
              >
                <div style={labelStyle}>Dane kontaktowe do dostawy</div>
                <div style={linesStyle}>
                  <div>
                    <strong>Telefon:</strong> {order.shipping.phone}
                  </div>
                  <div>
                    <strong>Email:</strong> {order.shipping.email}
                  </div>
                </div>
              </div>
            </div>

            {/* PŁATNOŚĆ I DOKUMENTY */}
            <div>
              <h4 style={h4Style}>Płatność i dokumenty</h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  fontSize: "13px",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <span style={{ color: "var(--text-muted, #8b8fa3)" }}>
                    Metoda:{" "}
                  </span>
                  <strong>
                    {order.paymentMethod === "prepaid"
                      ? "Płatność online"
                      : "Pobranie"}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted, #8b8fa3)" }}>
                    Wysyłka:{" "}
                  </span>
                  <strong>{fmt(order.shippingCost)}</strong>
                </div>
              </div>

              {/* FedEx label in documents */}
              {(order.paymentDetails as any)?.fedex?.labelUrl && (
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginBottom: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: "1px solid #1d4ed8",
                      background: "rgba(29,78,216,.1)",
                      fontSize: "13px",
                    }}
                  >
                    <a
                      href={(order.paymentDetails as any).fedex.labelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "#60a5fa",
                        textDecoration: "underline",
                        cursor: "pointer",
                      }}
                    >
                      🏷️ Etykieta FedEx (
                      {(order.paymentDetails as any).fedex.trackingNumber})
                    </a>
                  </div>
                </div>
              )}

              {/* ═══ INVOICE/DOCUMENT LIST ═══ */}
              {invoiceUrls.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginBottom: "12px",
                  }}
                >
                  {invoiceUrls.map((url, i) => (
                    <div
                      key={i}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 10px",
                        borderRadius: "6px",
                        border: "1px solid var(--border, #2d3348)",
                        background: "var(--bg, #0f1117)",
                        fontSize: "13px",
                      }}
                    >
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "var(--primary, #6366f1)",
                          textDecoration: "underline",
                          cursor: "pointer",
                        }}
                      >
                        📄 {formatFileName(url)}
                      </a>
                      <button
                        onClick={() => handleDelete(url, i)}
                        disabled={deleting === url}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#f87171",
                          cursor: deleting === url ? "wait" : "pointer",
                          padding: "2px 4px",
                          fontSize: "14px",
                          lineHeight: 1,
                          opacity: deleting === url ? 0.5 : 1,
                          borderRadius: "4px",
                        }}
                        title="Usuń dokument"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* ═══ UPLOAD BUTTON ═══ */}
              <div style={{ marginBottom: "12px" }}>
                <button
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.multiple = true;
                    input.accept =
                      ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.txt,.csv";
                    input.onchange = (e: Event) => {
                      const target = e.target as HTMLInputElement;
                      if (target?.files?.length) {
                        handleUpload(target.files);
                      }
                    };
                    input.click();
                  }}
                  disabled={uploading}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 16px",
                    background: "transparent",
                    color: "var(--text, #e4e6ef)",
                    border: "1px solid var(--border, #2d3348)",
                    borderRadius: "6px",
                    fontWeight: 500,
                    fontSize: "13px",
                    cursor: uploading ? "wait" : "pointer",
                    opacity: uploading ? 0.6 : 1,
                  }}
                >
                  {uploading ? "⏳ Wysyłanie..." : "📎 Dodaj dokumenty"}
                </button>
              </div>

              {/* ═══ ZAKOŃCZ / NADAJ ═══ */}
              {order.status === "paid" && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    onClick={async () => {
                      const totalWeight = Number(order.totalWeight) || 0;
                      let msg = "Oznaczyć jako wysłane?";
                      if (totalWeight <= 36.5 && totalWeight > 0) {
                        try {
                          const s = order.shipping as any;
                          const pc = s.differentShippingAddress
                            ? s.shippingPostalCode || s.postalCode
                            : s.postalCode;
                          const city = s.differentShippingAddress
                            ? s.shippingCity || s.city
                            : s.city;
                          const priceRes = await fetch(
                            `${API}/api/admin/fedex/price`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              credentials: "include",
                              body: JSON.stringify({
                                weightKg: totalWeight,
                                postalCode: pc,
                                city,
                              }),
                            },
                          );
                          const priceJson = await priceRes.json();
                          if (
                            priceJson.success &&
                            priceJson.data.rates?.length
                          ) {
                            const rate = priceJson.data.rates[0];
                            msg = `Wysłać przez FedEx?\n\nCena: ${rate.totalCharge} ${rate.currency}\nSerwis: ${rate.serviceType}\nWaga: ${totalWeight} kg`;
                          }
                        } catch {}
                      }
                      if (!confirm(msg)) return;
                      setShipping(true);
                      try {
                        await fetch(`${API}/api/orders/${order.id}/status`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "shipped" }),
                        });
                        onStatusChange?.("shipped");
                        onClose();
                      } catch {
                        alert("Błąd zmiany statusu");
                        setShipping(false);
                      }
                    }}
                    disabled={shipping}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 16px",
                      background:
                        Number(order.totalWeight) <= 36.5 &&
                        Number(order.totalWeight) > 0
                          ? "#2563eb"
                          : "var(--primary, #6366f1)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      fontWeight: 600,
                      fontSize: "13px",
                      cursor: shipping ? "wait" : "pointer",
                      opacity: shipping ? 0.6 : 1,
                    }}
                  >
                    {shipping
                      ? "⏳ Wysyłanie..."
                      : Number(order.totalWeight) <= 36.5 &&
                          Number(order.totalWeight) > 0
                        ? "📦 FedEx"
                        : "🚚 Zakończ zamówienie bez API"}
                  </button>
                  {Number(order.totalWeight) > 36.5 && (
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
                              headers: { "Content-Type": "application/json" },
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
                              msg += ` (+ dopłata paliwowa: ${priceJson.data.fuelSurcharge} PLN)`;
                            msg += `\nWaga: ${order.totalWeight} kg\nUbezpieczenie: ${order.total} PLN`;
                          } else {
                            msg += `(Nie udało się pobrać ceny)\nWaga: ${order.totalWeight} kg`;
                          }
                          if (!confirm(msg)) return;
                        } catch {}
                        setShipping(true);
                        try {
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
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: "shipped" }),
                              },
                            );
                            alert(`✅ DHL: ${json.data.trackingNumber}`);
                            onStatusChange?.("shipped");
                            onClose();
                          } else {
                            alert(`❌ ${json.error || "Błąd DHL"}`);
                            setShipping(false);
                          }
                        } catch (err: any) {
                          alert(`❌ ${err.message || "Błąd DHL"}`);
                          setShipping(false);
                        }
                      }}
                      disabled={shipping}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 16px",
                        background: "#ca8a04",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        fontWeight: 600,
                        fontSize: "13px",
                        cursor: shipping ? "wait" : "pointer",
                        opacity: shipping ? 0.6 : 1,
                      }}
                    >
                      {shipping ? "⏳..." : "📦 Nadaj DHL"}
                    </button>
                  )}
                  {Number(order.totalWeight) > 36.5 && (
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
                              headers: { "Content-Type": "application/json" },
                              credentials: "include",
                              body: JSON.stringify({
                                weightKg: order.totalWeight,
                                postalCode: pc,
                              }),
                            },
                          );
                          const offJson = await offRes.json();
                          const offers =
                            offJson.data?.offers || offJson.offers || [];
                          if (!offers.length) {
                            alert("Brak ofert Wysylajnami");
                            return;
                          }
                          setWnModal({ order, offers });
                        } catch (err: any) {
                          alert(err.message || "Błąd");
                        }
                      }}
                      disabled={shipping}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 16px",
                        background: "#16a34a",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        fontWeight: 600,
                        fontSize: "13px",
                        cursor: shipping ? "wait" : "pointer",
                        opacity: shipping ? 0.6 : 1,
                      }}
                    >
                      🚛 Wysyłaj z nami
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* PRZESYŁKA FEDEX */}
            {(() => {
              const fedex = (order.paymentDetails as any)?.fedex;
              if (!fedex?.trackingNumber) return null;
              return (
                <div
                  style={{
                    border: "2px solid #1d4ed8",
                    borderRadius: "8px",
                    padding: "16px",
                    background: "rgba(29,78,216,.15)",
                  }}
                >
                  <h4 style={{ ...h4Style, color: "#60a5fa" }}>
                    📦 Przesyłka FedEx
                  </h4>
                  <div style={linesStyle}>
                    <div>
                      <strong>Tracking:</strong>{" "}
                      <a
                        href={`https://www.fedex.com/fedextrack/?trknbr=${fedex.trackingNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "#60a5fa",
                          textDecoration: "underline",
                        }}
                      >
                        {fedex.trackingNumber}
                      </a>
                    </div>
                    <div>
                      <strong>Serwis:</strong> {fedex.serviceType}
                    </div>
                    <div>
                      <strong>Data nadania:</strong> {fedex.shipDate}
                    </div>
                    {fedex.labelUrl && (
                      <div style={{ marginTop: 8 }}>
                        <a
                          href={fedex.labelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 14px",
                            background: "#1d4ed8",
                            color: "#fff",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            textDecoration: "none",
                          }}
                        >
                          🏷️ Pobierz etykietę PDF
                        </a>
                        <button
                          onClick={async () => {
                            if (
                              !confirm(
                                `Anulować przesyłkę FedEx ${fedex.trackingNumber}?`,
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
                                alert("✅ Przesyłka FedEx anulowana");
                                onClose();
                              } else {
                                alert(`❌ ${json.error || "Błąd anulowania"}`);
                              }
                            } catch {
                              alert("❌ Błąd anulowania FedEx");
                            }
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 14px",
                            background: "transparent",
                            color: "#f87171",
                            border: "1px solid #991b1b",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            marginLeft: "8px",
                          }}
                        >
                          ✕ Anuluj przesyłkę
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            {/* PRZESYŁKA DHL */}
            {(() => {
              const dhl = (order.paymentDetails as any)?.dhl;
              if (!dhl?.trackingNumber) return null;
              return (
                <div
                  style={{
                    border: "2px solid #ca8a04",
                    borderRadius: "8px",
                    padding: "16px",
                    background: "rgba(202,138,4,.15)",
                  }}
                >
                  <h4 style={{ ...h4Style, color: "#facc15" }}>
                    📦 Przesyłka DHL
                  </h4>
                  <div style={linesStyle}>
                    <div>
                      <strong>Tracking:</strong>{" "}
                      <a
                        href={`https://www.dhl.com/pl-pl/home/sledzenie.html?tracking-id=${dhl.trackingNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "#facc15",
                          textDecoration: "underline",
                        }}
                      >
                        {dhl.trackingNumber}
                      </a>
                    </div>
                    <div>
                      <strong>Data nadania:</strong> {dhl.shipDate}
                    </div>
                    {dhl.labelUrl && (
                      <div style={{ marginTop: 8 }}>
                        <a
                          href={dhl.labelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 14px",
                            background: "#ca8a04",
                            color: "#fff",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            textDecoration: "none",
                          }}
                        >
                          🏷️ Pobierz etykietę DHL
                        </a>
                        <button
                          onClick={async () => {
                            if (
                              !confirm(
                                `Anulować przesyłkę DHL ${dhl.trackingNumber}?`,
                              )
                            )
                              return;
                            try {
                              const res = await fetch(
                                `${API}/api/admin/dhl/ship/${order.id}`,
                                { method: "DELETE", credentials: "include" },
                              );
                              const json = await res.json();
                              if (json.success) {
                                alert("✅ Przesyłka DHL anulowana");
                                onClose();
                              } else {
                                alert(`❌ ${json.error || "Błąd anulowania"}`);
                              }
                            } catch {
                              alert("❌ Błąd anulowania DHL");
                            }
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 14px",
                            background: "transparent",
                            color: "#f87171",
                            border: "1px solid #991b1b",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            marginLeft: "8px",
                          }}
                        >
                          ✕ Anuluj przesyłkę
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            {/* PRZESYŁKA WYSYLAJNAMI */}
            {(() => {
              const wn = (order.paymentDetails as any)?.wysylajnami;
              if (!wn?.orderId) return null;
              return (
                <div
                  style={{
                    border: "2px solid #16a34a",
                    borderRadius: "8px",
                    padding: "16px",
                    background: "rgba(22,163,74,.15)",
                  }}
                >
                  <h4 style={{ ...h4Style, color: "#4ade80" }}>
                    🚛 Przesyłka Wysylajnami.pl
                  </h4>
                  <div style={linesStyle}>
                    {wn.waybillNumber && (
                      <div>
                        <strong>List przewozowy:</strong>{" "}
                        <a
                          href={wn.trackingUrl || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "#4ade80",
                            textDecoration: "underline",
                          }}
                        >
                          {wn.waybillNumber}
                        </a>
                      </div>
                    )}
                    <div>
                      <strong>Kurier:</strong>{" "}
                      {wn.courierId === 5
                        ? "DHL"
                        : wn.courierId === 3
                          ? "DPD"
                          : wn.courierId === 14
                            ? "UPS"
                            : wn.courierId === 12
                              ? "FedEx"
                              : `#${wn.courierId}`}
                    </div>
                    <div>
                      <strong>Cena:</strong> {wn.price} PLN
                    </div>
                    <div>
                      <strong>ID zamówienia WN:</strong> {wn.orderId}
                    </div>
                    {wn.labelUrl && (
                      <div style={{ marginTop: 8 }}>
                        <a
                          href={wn.labelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 14px",
                            background: "#16a34a",
                            color: "#fff",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            textDecoration: "none",
                          }}
                        >
                          🏷️ Pobierz etykietę
                        </a>
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
                                alert("✅ Przesyłka Wysylajnami anulowana");
                                onClose();
                              } else {
                                alert(`❌ ${json.error || "Błąd anulowania"}`);
                              }
                            } catch {
                              alert("❌ Błąd anulowania Wysylajnami");
                            }
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 14px",
                            background: "transparent",
                            color: "#f87171",
                            border: "1px solid #991b1b",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            marginLeft: "8px",
                          }}
                        >
                          ✕ Anuluj przesyłkę
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            {/* UWAGI */}
            {order.shipping.notes && (
              <div
                style={{
                  border: "1px solid #854d0e",
                  borderRadius: "8px",
                  padding: "16px",
                  background: "rgba(113,63,18,.15)",
                }}
              >
                <h4 style={{ ...h4Style, color: "#fbbf24" }}>
                  💬 UWAGI DO ZAMÓWIENIA
                </h4>
                <p
                  style={{
                    fontSize: "13px",
                    whiteSpace: "pre-wrap",
                    margin: 0,
                    color: "var(--text, #e4e6ef)",
                  }}
                >
                  {order.shipping.notes}
                </p>
              </div>
            )}

            {/* PODSUMOWANIE KOŃCOWE */}
            <div
              style={{
                borderTop: "1px solid var(--border, #2d3348)",
                paddingTop: "16px",
              }}
            >
              <h4 style={h4Style}>Podsumowanie zamówienia</h4>
              <div style={{ fontSize: "13px", marginLeft: "8px" }}>
                <div style={sumRowStyle}>
                  <span style={{ color: "var(--text-muted, #8b8fa3)" }}>
                    Produkty:
                  </span>
                  <span>{fmt(order.subtotal)}</span>
                </div>
                <div style={sumRowStyle}>
                  <span style={{ color: "var(--text-muted, #8b8fa3)" }}>
                    Dostawa:
                  </span>
                  <span>{fmt(order.shippingCost)}</span>
                </div>
                <div
                  style={{
                    marginTop: "8px",
                    paddingTop: "8px",
                    borderTop: "1px solid var(--border, #2d3348)",
                  }}
                >
                  Razem:{" "}
                  <span
                    style={{
                      fontSize: "18px",
                      fontWeight: 700,
                      color: "var(--primary, #6366f1)",
                    }}
                  >
                    {fmt(order.total)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Wysylajnami Courier Select Modal */}
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
                alert(
                  `✅ ${offer.courierName}: ${json.data.waybillNumber} (${json.data.price} PLN)`,
                );
                setWnModal(null);
                onStatusChange?.("shipped");
                onClose();
              } else {
                alert(`❌ ${json.error || "Błąd"}`);
              }
            } catch (err: any) {
              alert(`❌ ${err.message || "Błąd"}`);
            } finally {
              setWnLoading(false);
            }
          }}
        />
      )}
      <style>{`
        @keyframes odFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes odSlideUp { from { opacity: 0; transform: translateY(30px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </>
  );
}

// ============================================
// Shared style objects
// ============================================
const h4Style: React.CSSProperties = {
  fontWeight: 600,
  fontSize: "14px",
  margin: "0 0 12px 0",
  color: "var(--text, #e4e6ef)",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--border, #2d3348)",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "12px",
};

const linesStyle: React.CSSProperties = {
  fontSize: "13px",
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  color: "var(--text, #e4e6ef)",
};

const labelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "var(--text-muted, #8b8fa3)",
  marginBottom: "4px",
};

const hrStyle: React.CSSProperties = {
  borderTop: "1px solid var(--border, #2d3348)",
  margin: "12px 0",
};

const sumRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: "4px",
};

const bannerWarning: React.CSSProperties = {
  background: "rgba(113,63,18,.2)",
  border: "1px solid #854d0e",
  borderRadius: "6px",
  padding: "10px 14px",
  marginBottom: "12px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#cf9604",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const bannerSuccess: React.CSSProperties = {
  background: "rgba(22,101,52,.2)",
  border: "1px solid #166534",
  borderRadius: "6px",
  padding: "10px 14px",
  marginBottom: "12px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#4ade80",
};
