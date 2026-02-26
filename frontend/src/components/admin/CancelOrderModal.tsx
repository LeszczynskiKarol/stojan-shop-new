// frontend/src/components/admin/CancelOrderModal.tsx
// Port 1:1 ze starego Next.js – bez shadcn/ui, bez framer-motion
import { useState, useEffect } from "react";

interface CancelOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  orderCount?: number;
  orderNumber?: string;
}

export function CancelOrderModal({
  isOpen,
  onClose,
  onConfirm,
  orderCount = 1,
  orderNumber,
}: CancelOrderModalProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const predefinedReasons = [
    "Klient zrezygnował z zakupu",
    "Błąd w zamówieniu",
    "Produkt niedostępny",
    "Problem z płatnością",
    "Błędne dane adresowe",
    "Duplikat zamówienia",
    "Podejrzenie oszustwa",
    "Inne",
  ];

  useEffect(() => {
    if (!isOpen) {
      setReason("");
      setError("");
      setIsSubmitting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError("Powód anulowania jest wymagany");
      return;
    }
    if (reason.trim().length < 5) {
      setError("Powód musi zawierać minimum 5 znaków");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch {
      setError("Wystąpił błąd podczas anulowania zamówienia");
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) handleSubmit();
    if (e.key === "Escape") onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]"
        style={{ animation: "fadeIn .15s ease" }}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg shadow-2xl pointer-events-auto max-h-[90vh] overflow-y-auto"
          style={{ animation: "slideUp .2s ease" }}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[hsl(var(--border))] sticky top-0 bg-[hsl(var(--background))] z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-full">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-red-600 dark:text-red-400"
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                  Anuluj{" "}
                  {orderCount > 1 ? `${orderCount} zamówień` : "zamówienie"}
                </h2>
                {orderNumber && (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    Numer: {orderNumber}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-2 rounded-lg hover:bg-[hsl(var(--accent))] transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Warning */}
            <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>Uwaga!</strong> Ta operacja jest nieodwracalna.
                {orderCount > 1
                  ? ` Wszystkie ${orderCount} zaznaczone zamówienia zostaną anulowane.`
                  : " Zamówienie zostanie oznaczone jako anulowane i nie będzie mogło być przywrócone."}
              </p>
            </div>

            {/* Predefined reasons */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-[hsl(var(--foreground))]">
                Wybierz powód anulowania:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {predefinedReasons.map((r) => (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    disabled={isSubmitting}
                    className={`px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                      reason === r
                        ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]"
                        : "border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom reason */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-[hsl(var(--foreground))]">
                Lub wpisz własny powód:
              </label>
              <textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError("");
                }}
                placeholder="Opisz powód anulowania zamówienia..."
                className="w-full min-h-[100px] px-3 py-2 border border-[hsl(var(--border))] rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-sm"
                disabled={isSubmitting}
                autoFocus
              />
              <div className="flex justify-between items-center">
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Minimum 5 znaków • {reason.length}/500
                </p>
                {error && <p className="text-xs text-red-500">{error}</p>}
              </div>
            </div>

            {/* Info */}
            <div className="text-xs text-[hsl(var(--muted-foreground))] space-y-1 border-t border-[hsl(var(--border))] pt-3">
              <p>• Klient otrzyma powiadomienie o anulowaniu zamówienia</p>
              <p>• Stan magazynowy zostanie automatycznie przywrócony</p>
              {orderCount > 1 && (
                <p className="font-medium text-[hsl(var(--primary))]">
                  • Anulowanych zostanie {orderCount} zamówień
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-[hsl(var(--border))] bg-[hsl(var(--accent))]/30 sticky bottom-0">
            <div className="text-xs text-[hsl(var(--muted-foreground))]">
              <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-[hsl(var(--accent))] border border-[hsl(var(--border))] rounded">
                Ctrl
              </kbd>
              +
              <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-[hsl(var(--accent))] border border-[hsl(var(--border))] rounded">
                Enter
              </kbd>{" "}
              aby potwierdzić
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--accent))] transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !reason.trim()}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isSubmitting
                  ? "Anulowanie..."
                  : `Potwierdź anulowanie${orderCount > 1 ? ` (${orderCount})` : ""}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(.95) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>
    </>
  );
}
