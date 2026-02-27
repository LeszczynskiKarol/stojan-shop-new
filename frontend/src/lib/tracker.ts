// frontend/src/lib/tracker.ts
// Wewnętrzna analityka — lightweight tracker
// Dodaj do BaseLayout: <script> import { tracker } from '@/lib/tracker'; tracker.init(); </script>

const API_URL =
  (typeof window !== "undefined" && (window as any).__PUBLIC_API_URL) ||
  (typeof window !== "undefined" && (window as any).__API_URL) ||
  "http://localhost:4000";

const VISITOR_KEY = "stojan_vid";
const HEARTBEAT_INTERVAL = 30_000; // 30s

/** Generate random visitor ID */
function generateVisitorId(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Get or create persistent visitor ID */
function getVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = generateVisitorId();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return generateVisitorId();
  }
}

/** Check if user is admin (has admin cookie — skips tracking server-side too) */
function isAdmin(): boolean {
  try {
    return document.cookie.includes("admin_token=");
  } catch {
    return false;
  }
}

/** Detect bots by user-agent */
function isBot(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return /bot|crawl|spider|slurp|bingbot|googlebot|yandex|baidu|duckduck|facebookexternalhit|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider/i.test(
    ua,
  );
}

/** Extract URL params relevant for source detection */
function getSessionMeta(): {
  referrer?: string;
  srsltid?: string;
  gclid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  screenWidth: number;
  screenHeight: number;
} {
  // Use raw search string, decode &amp; entities (bot protection)
  const rawSearch = window.location.search.replace(/&amp;/g, "&");
  const params = new URLSearchParams(rawSearch);
  return {
    referrer: document.referrer || undefined,
    srsltid: params.get("srsltid") || undefined,
    gclid: params.get("gclid") || undefined,
    utm_source: params.get("utm_source") || undefined,
    utm_medium: params.get("utm_medium") || undefined,
    utm_campaign: params.get("utm_campaign") || undefined,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
  };
}

/** Send tracking event (fire-and-forget via sendBeacon with fetch fallback) */
function send(
  type: string,
  page: string,
  data?: Record<string, any>,
  includeSessionMeta = false,
): void {
  if (isAdmin()) return;

  const payload: any = {
    visitorId: getVisitorId(),
    type,
    page,
  };

  if (data) payload.data = data;
  if (includeSessionMeta) payload.sessionMeta = getSessionMeta();

  const url = `${API_URL}/api/analytics/event`;
  const body = JSON.stringify(payload);

  // Try sendBeacon first (survives page unload), fall back to fetch
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    const sent = navigator.sendBeacon(url, blob);
    if (sent) return;
  }

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    credentials: "include",
  }).catch(() => {});
}

/** Send heartbeat to keep session alive */
function sendHeartbeat(): void {
  if (isAdmin()) return;
  const url = `${API_URL}/api/analytics/heartbeat`;
  const body = JSON.stringify({
    visitorId: getVisitorId(),
    page: window.location.pathname,
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
  } else {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "include",
    }).catch(() => {});
  }
}

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let initialized = false;

export const tracker = {
  /** Initialize — call once on page load */
  init(): void {
    if (typeof window === "undefined") return;
    if (isAdmin()) return;
    if (isBot()) return;
    if (initialized) return;
    initialized = true;

    // Track initial page view (clean &amp; entities from URL)
    const cleanPage = (
      window.location.pathname + window.location.search
    ).replace(/&amp;/g, "&");
    send("page_view", cleanPage, undefined, true);

    // Auto-detect product page view
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    if (
      pathParts.length === 2 &&
      !pathParts[0].startsWith("admin") &&
      !pathParts[0].startsWith("checkout")
    ) {
      // This is a /:categorySlug/:productSlug page — delay to get product info from DOM
      setTimeout(() => {
        const h1 = document.querySelector("h1");
        const priceEl = document.querySelector(
          ".text-primary.font-extrabold, .text-primary.font-bold",
        );
        const imgEl = document.querySelector("#mainImg") as HTMLImageElement;

        if (h1) {
          send("product_view", window.location.pathname, {
            productName: h1.textContent?.trim(),
            categorySlug: pathParts[0],
            slug: pathParts[1],
            price:
              priceEl?.textContent?.replace(/[^\d,]/g, "").replace(",", ".") ||
              null,
            image: imgEl?.src || null,
          });
        }
      }, 500);
    }

    // Detect checkout page
    if (
      window.location.pathname === "/checkout" ||
      window.location.pathname === "/zamowienie"
    ) {
      send("checkout_start", window.location.pathname);
    }

    // Detect success page
    if (
      window.location.pathname.startsWith("/checkout/sukces") ||
      window.location.pathname.startsWith("/zamowienie/sukces")
    ) {
      const params = new URLSearchParams(window.location.search);
      send("order_complete", window.location.pathname, {
        orderId: params.get("order_id") || params.get("session_id") || null,
      });
    }

    // Heartbeat
    heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    // Clean up on page unload
    window.addEventListener("beforeunload", () => {
      sendHeartbeat();
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    });

    // Track SPA-like navigation (Astro view transitions)
    document.addEventListener("astro:page-load", () => {
      send("page_view", window.location.pathname + window.location.search);
    });
  },

  /** Manually track a product view */
  productView(data: {
    productId?: string;
    productName: string;
    price?: number;
    slug?: string;
    categorySlug?: string;
    image?: string;
  }): void {
    send("product_view", window.location.pathname, data);
  },

  /** Track add to cart */
  addToCart(data: {
    productId: string;
    productName: string;
    price: number;
    quantity: number;
  }): void {
    send("add_to_cart", window.location.pathname, data);
  },

  /** Track checkout start */
  checkoutStart(): void {
    send("checkout_start", "/zamowienie");
  },

  /** Track order complete */
  orderComplete(data: {
    orderId: string;
    orderValue: number;
    itemCount: number;
  }): void {
    send("order_complete", window.location.pathname, data);
  },

  /** Track search */
  search(query: string, resultCount: number): void {
    send("search", window.location.pathname, { query, resultCount });
  },
};
