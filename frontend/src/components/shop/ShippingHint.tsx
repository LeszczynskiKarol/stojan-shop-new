// frontend/src/components/shop/ShippingHint.tsx
// Fetches real shipping cost from API + shows estimated delivery date
import { useState, useEffect } from "react";
import { formatShippingDate, formatDeliveryDate } from "@/utils/deliveryDate";

const API_URL =
  (import.meta as any).env?.PUBLIC_API_URL || "http://localhost:4000";

interface Props {
  productId: string;
  quantity?: number;
  weight?: number;
}

export function ShippingHint({ productId, quantity = 1, weight }: Props) {
  const [cost, setCost] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/orders/calculate-shipping`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [{ productId, quantity }],
            paymentMethod: "prepaid",
          }),
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.data?.cost != null) {
          setCost(json.data.cost);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, quantity]);

  const shippingStr =
    cost !== null
      ? `Wysyłka: ${cost.toLocaleString("pl-PL", { minimumFractionDigits: cost % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })} zł`
      : "Koszt dostawy obliczany przy zamówieniu";

  return (
    <div className="sh-wrap">
      <span className="sh-vat">Cena zawiera 23% VAT · {shippingStr}</span>
      {weight != null && weight > 0 && (
        <div className="sh-delivery">
          <svg
            className="sh-truck"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="1" y="3" width="15" height="13" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
          <span>
            Wysyłka <strong>{formatShippingDate(weight)}</strong>
          </span>
        </div>
      )}
      <style>{`
        .sh-wrap { display: flex; flex-direction: column; gap: 6px; }
        .sh-vat { font-size: 12px; color: hsl(var(--muted-foreground)); }
        .sh-delivery {
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; color: hsl(var(--muted-foreground));
        }
        .sh-delivery strong { color: hsl(var(--foreground)); font-weight: 600; }
        .sh-truck { color: hsl(var(--primary)); flex-shrink: 0; }
      `}</style>
    </div>
  );
}
