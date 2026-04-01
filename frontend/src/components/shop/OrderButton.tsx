// frontend/src/components/shop/OrderButton.tsx
// "Zamów teraz" — adds to cart + redirects to /checkout
// v2 — GA4 view_item event on mount
import { useState, useEffect } from "react";
import { cart, type CartItem } from "@/lib/cart";

interface Props {
  product: {
    id: string;
    name: string;
    price: number;
    mainImage?: string;
    images?: string[];
    stock: number;
    weight?: number;
    manufacturer?: string;
    condition?: string;
    power?: any;
    rpm?: any;
    marketplaces?: any;
    categories?: any[];
  };
  categorySlug: string;
  productSlug: string;
}

export function OrderButton({ product, categorySlug, productSlug }: Props) {
  const [quantity, setQuantity] = useState(1);

  const mp = product.marketplaces as any;
  const price = mp?.ownStore?.price ?? product.price;
  const pw =
    typeof product.power === "object" ? product.power?.value : product.power;
  const rpm =
    typeof product.rpm === "object" ? product.rpm?.value : product.rpm;

  // GA4 view_item — fires once when product page renders
  useEffect(() => {
    try {
      if (window.gtag) {
        window.gtag("event", "view_item", {
          currency: "PLN",
          value: Number(price),
          items: [
            {
              item_id: product.id,
              item_name: product.name,
              item_category: categorySlug,
              item_brand: product.manufacturer || undefined,
              price: Number(price),
              quantity: 1,
            },
          ],
        });
      }
    } catch {}
  }, [product.id]);

  const handleOrder = () => {
    const item: CartItem = {
      productId: product.id,
      name: product.name,
      price: Number(price),
      image: product.mainImage || product.images?.[0] || "",
      quantity,
      stock: product.stock,
      weight: product.weight || 0,
      manufacturer: product.manufacturer || "",
      condition: product.condition || "",
      categorySlug,
      productSlug,
      power: pw,
      rpm,
    };
    cart.add(item);
    window.location.href = "/checkout";
  };

  return (
    <div className="flex items-center gap-3">
      {product.stock > 1 && (
        <div className="flex items-center border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--card))]">
          <button
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="w-10 h-11 flex items-center justify-center hover:bg-[hsl(var(--accent))] transition-colors rounded-l-lg text-lg"
          >
            −
          </button>
          <span className="w-12 h-11 flex items-center justify-center font-semibold text-[hsl(var(--foreground))]">
            {quantity}
          </span>
          <button
            onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
            className="w-10 h-11 flex items-center justify-center hover:bg-[hsl(var(--accent))] transition-colors rounded-r-lg text-lg"
          >
            +
          </button>
        </div>
      )}

      <button
        onClick={handleOrder}
        disabled={product.stock === 0}
        className="flex-1 h-11 px-6 rounded-lg font-semibold text-[hsl(var(--primary-foreground))] bg-[hsl(var(--primary))] hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {quantity === 1 ? "Zamawiam →" : `Zamawiam ${quantity} szt.  →`}
      </button>
    </div>
  );
}
