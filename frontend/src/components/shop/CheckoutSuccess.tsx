// frontend/src/components/shop/CheckoutSuccess.tsx
import { useEffect, useState } from "react";
import { tracker } from "@/lib/tracker";

const API_URL =
  (import.meta as any).env?.PUBLIC_API_URL || "http://localhost:4000";

interface OrderDetails {
  id: string;
  orderNumber: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    image?: string;
  }>;
  shipping: {
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
  };
  shippingCost: number;
  total: number;
  paymentMethod: string;
}

export function CheckoutSuccess() {
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (order) {
      tracker.orderComplete({
        orderId: order.id,
        orderValue: Number(order.total),
        itemCount: order.items.length,
      });
    }
  }, [order]);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const orderId = params.get("order_id");
        const sessionId = params.get("session_id");

        let resolvedId = orderId;

        // If coming from Stripe, get orderId from session
        if (sessionId && !orderId) {
          const res = await fetch(
            `${API_URL}/api/orders/by-stripe-session/${sessionId}`,
          );
          const data = await res.json();
          if (data.success && data.data) {
            setOrder(data.data);
            setLoading(false);
            return;
          }
        }

        if (!resolvedId) {
          setLoading(false);
          return;
        }

        const res = await fetch(`${API_URL}/api/orders/${resolvedId}`);
        const data = await res.json();

        if (data.success || data.data) {
          setOrder(data.data || data);
        }
      } catch (err) {
        console.error("Błąd pobierania zamówienia:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, []);

  const fmt = (v: number) =>
    v.toLocaleString("pl-PL", {
      minimumFractionDigits: v % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold mb-4 text-[hsl(var(--foreground))]">
          Nie znaleziono zamówienia
        </h1>
        <a href="/" className="text-[hsl(var(--primary))] hover:underline">
          Wróć do sklepu
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Success header */}
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-green-600 dark:text-green-400"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-[hsl(var(--foreground))] mb-2">
          Dziękujemy za zamówienie!
        </h1>
        <p className="text-[hsl(var(--muted-foreground))]">
          Numer zamówienia:{" "}
          <strong className="text-[hsl(var(--foreground))]">
            {order.orderNumber}
          </strong>
        </p>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
          Potwierdzenie zostało wysłane na: {order.shipping.email}
        </p>
      </div>

      {/* Order details */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--accent))]/30">
          <h2 className="font-semibold text-sm text-[hsl(var(--foreground))]">
            Szczegóły zamówienia
          </h2>
        </div>
        <div className="p-5 space-y-4">
          {order.items.map((item, i) => (
            <div key={i} className="flex gap-4">
              {item.image && (
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-[hsl(var(--accent))] shrink-0">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-contain p-1"
                  />
                </div>
              )}
              <div className="flex-1">
                <p className="font-medium text-sm text-[hsl(var(--foreground))]">
                  {item.name}
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {fmt(item.price)} zł × {item.quantity} szt.
                </p>
              </div>
              <div className="font-semibold text-sm text-[hsl(var(--foreground))]">
                {fmt(item.price * item.quantity)} zł
              </div>
            </div>
          ))}

          <div className="border-t border-[hsl(var(--border))] pt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-[hsl(var(--muted-foreground))]">
                Dostawa
              </span>
              <span>{fmt(Number(order.shippingCost))} zł</span>
            </div>
            <div className="flex justify-between font-bold text-lg">
              <span>Razem</span>
              <span className="text-[hsl(var(--primary))]">
                {fmt(Number(order.total))} zł
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Shipping info */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm text-[hsl(var(--foreground))]">
          {order.shipping.differentShippingAddress
            ? "Dane zamawiającego"
            : "Dane i adres dostawy"}
        </h2>
        <div className="text-sm text-[hsl(var(--muted-foreground))] space-y-1">
          {order.shipping.companyName ? (
            <>
              <p className="font-medium text-[hsl(var(--foreground))]">
                {order.shipping.companyName}
              </p>
              {order.shipping.nip && <p>NIP: {order.shipping.nip}</p>}
            </>
          ) : (
            <p className="font-medium text-[hsl(var(--foreground))]">
              {order.shipping.firstName} {order.shipping.lastName}
            </p>
          )}
          <p>{order.shipping.street}</p>
          <p>
            {order.shipping.postalCode} {order.shipping.city}
          </p>
          <p>Tel: {order.shipping.phone}</p>
          <p>Email: {order.shipping.email}</p>
        </div>

        {order.shipping.differentShippingAddress && (
          <div className="pt-3 border-t border-[hsl(var(--border))]">
            <h3 className="font-semibold text-sm text-[hsl(var(--foreground))] mb-2">
              Adres dostawy
            </h3>
            <div className="text-sm text-[hsl(var(--muted-foreground))] space-y-1">
              <p>{order.shipping.shippingStreet}</p>
              <p>
                {order.shipping.shippingPostalCode}{" "}
                {order.shipping.shippingCity}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Back button */}
      <div className="text-center">
        <a
          href="/"
          className="inline-flex h-12 items-center px-8 rounded-xl font-semibold bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-all"
        >
          Wróć do sklepu
        </a>
      </div>
    </div>
  );
}
