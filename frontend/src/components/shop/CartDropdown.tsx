// frontend/src/components/shop/CartDropdown.tsx
import { useState, useEffect, useRef } from "react";
import { cart, type CartItem } from "@/lib/cart";

const COND_LABEL: Record<string, string> = {
  nowy: "Nowy",
  uzywany: "Używany",
  nieuzywany: "Nieużywany",
};

function fmt(n: number) {
  return n.toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function CartDropdown() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [isCheckoutPage, setIsCheckoutPage] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

  const refresh = () => setItems(cart.getItems());

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    refresh();
    setIsCheckoutPage(
      window.location.pathname.replace(/\/+$/, "") === "/checkout",
    );
    window.addEventListener("cart-updated", refresh);
    return () => window.removeEventListener("cart-updated", refresh);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 998,
            animation: "cdFadeIn 0.15s ease-out",
          }}
        />
      )}

      <div ref={ref} style={{ position: "relative" }}>
        {/* Przycisk koszyka */}
        <button
          onClick={() => setOpen(!open)}
          className="cd-btn"
          aria-label="Koszyk"
          aria-expanded={open}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          {count > 0 && <span className="cd-badge">{count}</span>}
        </button>

        {/* Modal */}
        {open && (
          <div className="cd-drop">
            {/* Header */}
            <div className="cd-hd">
              <span className="cd-hd-title">Koszyk ({count} szt.)</span>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                {items.length > 0 && (
                  <button onClick={() => cart.clear()} className="cd-hd-clear">
                    Wyczyść
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Zamknij"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px",
                    color: "hsl(var(--muted-foreground))",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Lista */}
            <div className="cd-list">
              {items.length === 0 ? (
                <div className="cd-empty">Koszyk jest pusty</div>
              ) : (
                items.map((item) => (
                  <div key={item.productId} className="cd-item">
                    <a
                      href={`/${item.categorySlug}/${item.productSlug}`}
                      className="cd-item-img"
                      onClick={() => setOpen(false)}
                    >
                      {item.image ? (
                        <img src={item.image} alt="" loading="lazy" />
                      ) : (
                        <div className="cd-item-noimg" />
                      )}
                    </a>
                    <div className="cd-item-info">
                      <a
                        href={`/${item.categorySlug}/${item.productSlug}`}
                        className="cd-item-name"
                        onClick={() => setOpen(false)}
                      >
                        {item.name}
                      </a>
                      <div className="cd-item-meta">
                        {item.quantity > 1 && <span>{item.quantity} szt.</span>}
                        {item.power && item.power !== "0" && (
                          <span>{item.power} kW</span>
                        )}
                        {item.condition && (
                          <span>
                            {COND_LABEL[item.condition] || item.condition}
                          </span>
                        )}
                      </div>
                      <div className="cd-item-bottom">
                        <span className="cd-item-price">
                          {fmt(item.price * item.quantity)} zł
                        </span>
                        <button
                          onClick={() => cart.remove(item.productId)}
                          className="cd-item-rm"
                          aria-label="Usuń"
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="cd-footer">
                <div className="cd-total">
                  <span>Razem</span>
                  <span className="cd-total-val">{fmt(subtotal)} zł</span>
                </div>
                {!isCheckoutPage && (
                  <a
                    href="/checkout"
                    className="cd-order"
                    onClick={() => setOpen(false)}
                  >
                    Zamawiam
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        /* Przycisk */
        .cd-btn {
          position: relative;
          display: flex; align-items: center; justify-content: center;
          padding: 8px; border-radius: 8px; border: none; background: none;
          color: hsl(var(--muted-foreground)); cursor: pointer; transition: all 0.1s;
        }
        .cd-btn:hover { background: hsl(var(--accent)); color: hsl(var(--foreground)); }

        .cd-badge {
          position: absolute; top: -2px; right: -2px;
          min-width: 18px; height: 18px; padding: 0 5px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 9px; font-size: 10px; font-weight: 700;
          background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
          pointer-events: none;
        }

        /* Modal — desktop: dropdown pod ikoną */
        .cd-drop {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: 340px;
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          border-radius: 12px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.18);
          z-index: 999;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: cdSlideDown 0.18s ease-out;
        }

        /* Mobile: fixed, pełna szerokość, pod headerem */
        @media (max-width: 639px) {
          .cd-drop {
            position: fixed;
            top: 64px; /* wysokość headera */
            left: 12px;
            right: 12px;
            width: auto;
            max-height: calc(100dvh - 80px);
            border-radius: 12px;
            animation: cdSlideDown 0.2s ease-out;
          }
        }

        /* Header modalu */
        .cd-hd {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 14px;
          border-bottom: 1px solid hsl(var(--border));
          flex-shrink: 0;
        }
        .cd-hd-title { font-size: 13px; font-weight: 600; color: hsl(var(--foreground)); }
        .cd-hd-clear {
          font-size: 11px; color: hsl(var(--muted-foreground));
          background: none; border: none; cursor: pointer; text-decoration: underline; padding: 4px 6px;
        }
        .cd-hd-clear:hover { color: #ef4444; }

        /* Lista — scrolluje się, NIE rozciąga */
        .cd-list {
          overflow-y: auto;
          max-height: 320px;
        }
        @media (max-width: 639px) {
          .cd-list {
            max-height: calc(100dvh - 80px - 56px - 110px); /* viewport - header - modal header - footer */
          }
        }

        .cd-empty {
          padding: 32px 20px; text-align: center;
          color: hsl(var(--muted-foreground)); font-size: 13px;
        }

        .cd-item {
          display: flex; gap: 10px; padding: 10px 14px;
          border-bottom: 1px solid hsl(var(--border) / 0.5);
        }
        .cd-item:last-child { border-bottom: none; }

        .cd-item-img {
          width: 56px; height: 56px; flex-shrink: 0;
          border-radius: 6px; overflow: hidden; background: hsl(var(--accent));
        }
        .cd-item-img img { width: 100%; height: 100%; object-fit: contain; }
        .cd-item-noimg { width: 100%; height: 100%; background: hsl(var(--border)); }

        .cd-item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }

        .cd-item-name {
          font-size: 12px; font-weight: 500; color: hsl(var(--foreground));
          text-decoration: none; line-height: 1.3;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .cd-item-name:hover { color: hsl(var(--primary)); }

        .cd-item-meta {
          display: flex; gap: 4px; flex-wrap: wrap;
          font-size: 10px; color: hsl(var(--muted-foreground));
        }
        .cd-item-meta span { padding: 1px 5px; border-radius: 3px; background: hsl(var(--accent)); }

        .cd-item-bottom {
          display: flex; align-items: center; justify-content: space-between;
          margin-top: 4px;
        }
        .cd-item-price { font-size: 13px; font-weight: 700; color: hsl(var(--primary)); }

        .cd-item-rm {
          display: flex; align-items: center; justify-content: center;
          width: 26px; height: 26px; border: none; border-radius: 4px;
          background: none; color: hsl(var(--muted-foreground)); cursor: pointer; transition: all 0.1s;
        }
        .cd-item-rm:hover { background: rgba(239,68,68,0.1); color: #ef4444; }

        /* Footer — zawsze widoczny na dole modalu */
        .cd-footer {
          flex-shrink: 0;
          padding: 12px 14px;
          border-top: 1px solid hsl(var(--border));
          background: hsl(var(--card));
        }

        .cd-total {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 10px;
          font-size: 13px; color: hsl(var(--muted-foreground));
        }
        .cd-total-val { font-size: 17px; font-weight: 800; color: hsl(var(--foreground)); }

        .cd-order {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          width: 100%; height: 42px; border-radius: 8px; border: none;
          font-size: 14px; font-weight: 700; text-decoration: none;
          background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
          cursor: pointer; transition: opacity 0.15s;
        }
        .cd-order:hover { opacity: 0.9; }

        @keyframes cdSlideDown {
          from { transform: translateY(-6px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes cdFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </>
  );
}
