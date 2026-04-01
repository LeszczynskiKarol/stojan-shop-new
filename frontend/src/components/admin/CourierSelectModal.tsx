// frontend/src/components/admin/CourierSelectModal.tsx
import { useState } from "react";

interface CourierOffer {
  courierId: number;
  courierName: string;
  price: number;
  currency: string;
  options?: Array<{ name: string; price: number }>;
}

interface CourierSelectModalProps {
  offers: CourierOffer[];
  orderNumber: string;
  weight: number;
  onSelect: (offer: CourierOffer) => void;
  onClose: () => void;
  loading?: boolean;
}

const courierBrands: Record<
  number,
  { color: string; bg: string; icon: string }
> = {
  1: { color: "#dc2626", bg: "rgba(220,38,38,.12)", icon: "📦" }, // Geis
  2: { color: "#1d4ed8", bg: "rgba(29,78,216,.12)", icon: "📦" }, // GLS
  3: { color: "#dc2626", bg: "rgba(220,38,38,.12)", icon: "🔴" }, // DPD
  4: { color: "#f59e0b", bg: "rgba(245,158,11,.12)", icon: "📮" }, // InPost
  5: { color: "#ca8a04", bg: "rgba(202,138,4,.12)", icon: "🟡" }, // DHL
  7: { color: "#dc2626", bg: "rgba(220,38,38,.12)", icon: "📦" }, // Geis ETL
  12: { color: "#4f46e5", bg: "rgba(79,70,229,.12)", icon: "🟣" }, // FedEx
  13: { color: "#0369a1", bg: "rgba(3,105,161,.12)", icon: "🔵" }, // GEODIS
  14: { color: "#78350f", bg: "rgba(120,53,15,.12)", icon: "🟤" }, // UPS
  16: { color: "#dc2626", bg: "rgba(220,38,38,.12)", icon: "📮" }, // Poczta Polska
  17: { color: "#dc2626", bg: "rgba(220,38,38,.12)", icon: "📮" }, // Pocztex
  18: { color: "#0ea5e9", bg: "rgba(14,165,233,.12)", icon: "🔵" }, // Rohlig SUUS
  22: { color: "#1d4ed8", bg: "rgba(29,78,216,.12)", icon: "🔵" }, // Rhenus
  26: { color: "#0369a1", bg: "rgba(3,105,161,.12)", icon: "🔵" }, // Hellmann
};

const defaultBrand = {
  color: "#6b7280",
  bg: "rgba(107,114,128,.12)",
  icon: "📦",
};

export function CourierSelectModal({
  offers,
  orderNumber,
  weight,
  onSelect,
  onClose,
  loading,
}: CourierSelectModalProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const sorted = [...offers].sort((a, b) => a.price - b.price);
  const cheapestId = sorted[0]?.courierId;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,.6)",
          zIndex: 10000,
          animation: "csmFadeIn .15s ease",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 10001,
          width: "520px",
          maxWidth: "95vw",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-card, #1a1d27)",
          border: "1px solid var(--border, #2d3348)",
          borderRadius: "14px",
          boxShadow: "0 25px 60px rgba(0,0,0,.5)",
          color: "var(--text, #e4e6ef)",
          animation: "csmSlideUp .2s ease",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--border, #2d3348)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>
              🚛 Wybierz kuriera
            </h3>
            <div
              style={{
                fontSize: "12px",
                color: "var(--text-muted, #8b8fa3)",
                marginTop: "4px",
              }}
            >
              Zamówienie #{orderNumber} • {weight} kg
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted, #8b8fa3)",
              cursor: "pointer",
              fontSize: "18px",
              padding: "4px 8px",
              borderRadius: "6px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Courier cards */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {sorted.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "32px",
                color: "var(--text-muted, #8b8fa3)",
              }}
            >
              Brak dostępnych ofert dla tej wagi
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              {sorted.map((offer, idx) => {
                const brand = courierBrands[offer.courierId] || defaultBrand;
                const isSelected = selected === offer.courierId;
                const isCheapest = offer.courierId === cheapestId;

                return (
                  <div
                    key={offer.courierId}
                    onClick={() => setSelected(offer.courierId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      padding: "14px 16px",
                      borderRadius: "10px",
                      border: isSelected
                        ? `2px solid ${brand.color}`
                        : "2px solid var(--border, #2d3348)",
                      background: isSelected ? brand.bg : "transparent",
                      cursor: "pointer",
                      transition: "all .15s ease",
                    }}
                  >
                    {/* Radio */}
                    <div
                      style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        border: isSelected
                          ? `6px solid ${brand.color}`
                          : "2px solid var(--text-muted, #8b8fa3)",
                        flexShrink: 0,
                        transition: "all .15s ease",
                      }}
                    />

                    {/* Icon + Name */}
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <span style={{ fontSize: "18px" }}>{brand.icon}</span>
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: "14px",
                            color: brand.color,
                          }}
                        >
                          {offer.courierName}
                        </span>
                        {isCheapest && (
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: "10px",
                              background: "#16a34a",
                              color: "#fff",
                              letterSpacing: "0.5px",
                            }}
                          >
                            NAJTAŃSZY
                          </span>
                        )}
                      </div>
                      {offer.options && offer.options.length > 0 && (
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--text-muted, #8b8fa3)",
                            marginTop: "2px",
                          }}
                        >
                          Opcje:{" "}
                          {offer.options
                            .map((o) => o.name.replace(/_/g, " "))
                            .join(", ")}
                        </div>
                      )}
                    </div>

                    {/* Price */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div
                        style={{
                          fontSize: "18px",
                          fontWeight: 800,
                          color: isSelected
                            ? brand.color
                            : "var(--text, #e4e6ef)",
                        }}
                      >
                        {offer.price.toFixed(2)}
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--text-muted, #8b8fa3)",
                        }}
                      >
                        {offer.currency}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border, #2d3348)",
            display: "flex",
            gap: "10px",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "10px 20px",
              background: "transparent",
              color: "var(--text-muted, #8b8fa3)",
              border: "1px solid var(--border, #2d3348)",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Anuluj
          </button>
          <button
            onClick={() => {
              const chosen = sorted.find((o) => o.courierId === selected);
              if (chosen) onSelect(chosen);
            }}
            disabled={!selected || loading}
            style={{
              padding: "10px 24px",
              background: selected
                ? courierBrands[selected]?.color || "#16a34a"
                : "#4b5563",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 700,
              cursor: !selected || loading ? "not-allowed" : "pointer",
              opacity: !selected || loading ? 0.5 : 1,
              transition: "all .15s ease",
            }}
          >
            {loading
              ? "⏳ Nadawanie..."
              : selected
                ? `Nadaj przez ${sorted.find((o) => o.courierId === selected)?.courierName} — ${sorted.find((o) => o.courierId === selected)?.price.toFixed(2)} PLN`
                : "Wybierz kuriera"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes csmFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes csmSlideUp { from { opacity: 0; transform: translate(-50%, -45%) } to { opacity: 1; transform: translate(-50%, -50%) } }
      `}</style>
    </>
  );
}
