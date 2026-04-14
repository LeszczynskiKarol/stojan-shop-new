// frontend/src/components/admin/ShipConfirmModal.tsx
// Modal potwierdzenia wysyłki przez kuriera
// Spójny z CancelOrderModal — hsl() CSS vars, dark/light mode

import { useState } from "react";

export interface ShipConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  courierName: string; // "FedEx" | "DHL" | "Wysyłaj z nami" | "Ręcznie"
  courierIcon?: string; // emoji, np. "📦"
  courierColor?: string; // tailwind color class for accent, e.g. "blue" | "yellow" | "green" | "gray"
  orderNumber: string;
  weightKg?: number;
  price?: string | null; // e.g. "~25 PLN"
  codAmount?: string | null; // e.g. "350 PLN" if COD
  extra?: string | null; // any extra info line
  loading?: boolean;
}

const colorMap: Record<string, { bg: string; border: string; text: string; btnBg: string }> = {
  blue:   { bg: "bg-blue-500/10",   border: "border-blue-500/30",   text: "text-blue-400",   btnBg: "bg-blue-600 hover:bg-blue-700" },
  yellow: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400", btnBg: "bg-yellow-600 hover:bg-yellow-700" },
  green:  { bg: "bg-green-500/10",  border: "border-green-500/30",  text: "text-green-400",  btnBg: "bg-green-600 hover:bg-green-700" },
  gray:   { bg: "bg-gray-500/10",   border: "border-gray-500/30",   text: "text-gray-400",   btnBg: "bg-gray-600 hover:bg-gray-700" },
};

export function ShipConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  courierName,
  courierIcon = "📦",
  courierColor = "blue",
  orderNumber,
  weightKg,
  price,
  codAmount,
  extra,
  loading = false,
}: ShipConfirmModalProps) {
  const [confirming, setConfirming] = useState(false);
  const colors = colorMap[courierColor] || colorMap.blue;

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  const isLoading = loading || confirming;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm"
        onClick={!isLoading ? onClose : undefined}
        style={{ animation: "scmFadeIn .15s ease" }}
      />

      {/* Modal */}
      <div
        className="fixed z-[10001] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md"
        style={{ animation: "scmSlideUp .2s ease" }}
      >
        <div className="bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-xl shadow-2xl overflow-hidden">
          {/* Header accent bar */}
          <div className={`h-1 ${colors.btnBg.split(" ")[0]}`} />

          {/* Content */}
          <div className="p-6">
            {/* Icon + Title */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-12 h-12 rounded-xl ${colors.bg} ${colors.border} border flex items-center justify-center text-2xl flex-shrink-0`}
              >
                {courierIcon}
              </div>
              <div>
                <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
                  Potwierdzenie wysyłki
                </h3>
                <p className={`text-sm font-medium ${colors.text}`}>
                  {courierName}
                </p>
              </div>
            </div>

            {/* Question */}
            <p className="text-sm text-[hsl(var(--foreground))] mb-4">
              Czy na pewno nadać zamówienie{" "}
              <span className="font-bold">#{orderNumber}</span> przez{" "}
              <span className={`font-bold ${colors.text}`}>{courierName}</span>?
            </p>

            {/* Details */}
            <div className={`rounded-lg ${colors.bg} ${colors.border} border p-3 mb-5 space-y-1.5`}>
              {weightKg != null && weightKg > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-[hsl(var(--muted-foreground))]">Waga</span>
                  <span className="font-medium text-[hsl(var(--foreground))]">
                    {weightKg} kg
                  </span>
                </div>
              )}
              {price && (
                <div className="flex justify-between text-sm">
                  <span className="text-[hsl(var(--muted-foreground))]">Cena wysyłki</span>
                  <span className={`font-medium ${colors.text}`}>{price}</span>
                </div>
              )}
              {codAmount && (
                <div className="flex justify-between text-sm">
                  <span className="text-[hsl(var(--muted-foreground))]">Pobranie</span>
                  <span className="font-medium text-orange-400">{codAmount}</span>
                </div>
              )}
              {extra && (
                <div className="text-xs text-[hsl(var(--muted-foreground))] pt-1 border-t border-[hsl(var(--border))]">
                  {extra}
                </div>
              )}
              {!weightKg && !price && !codAmount && !extra && (
                <div className="text-sm text-[hsl(var(--muted-foreground))]">
                  Brak dodatkowych informacji
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={isLoading}
                className="flex-1 h-10 px-4 rounded-lg border border-[hsl(var(--border))] text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors disabled:opacity-50"
              >
                Anuluj
              </button>
              <button
                onClick={handleConfirm}
                disabled={isLoading}
                className={`flex-1 h-10 px-4 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60 ${colors.btnBg}`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12" cy="12" r="10"
                        stroke="currentColor" strokeWidth="4" fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Wysyłanie...
                  </span>
                ) : (
                  `${courierIcon} Nadaj przez ${courierName}`
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scmFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scmSlideUp { from { opacity: 0; transform: translate(-50%, -50%) translateY(16px) } to { opacity: 1; transform: translate(-50%, -50%) translateY(0) } }
      `}</style>
    </>
  );
}
