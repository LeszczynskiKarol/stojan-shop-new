// frontend/src/lib/tracker.ts
// Wewnętrzna analityka — lightweight tracker
// v2 — FIX: session attribution across Stripe redirect, dedup order events

const API_URL =
  (typeof window !== "undefined" && (window as any).__PUBLIC_API_URL) ||
  (typeof window !== "undefined" && (window as any).__API_URL) ||
  "http://localhost:4000";

const VISITOR_KEY = "stojan_vid";
const VISITOR_SESSION_KEY = "stojan_vid_ss"; // sessionStorage backup
const CHECKOUT_CONTEXT_KEY = "stojan_checkout_ctx"; // pre-payment context
const ORDER_TRACKED_KEY = "stojan_order_tracked"; // dedup order events
const HEARTBEAT_INTERVAL = 30_000; // 30s

/** Generate random visitor ID */
function generateVisitorId(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Get or create persistent visitor ID.
 * Priority: sessionStorage > localStorage > generate new
 * sessionStorage survives Stripe redirect (same tab) even if Safari ITP clears localStorage
 */
function getVisitorId(): string {
  try {
    // 1. Try sessionStorage first (most reliable across payment redirects)
    let id = sessionStorage.getItem(VISITOR_SESSION_KEY);
    if (id) {
      // Sync back to localStorage if it was lost
      try {
        localStorage.setItem(VISITOR_KEY, id);
      } catch {}
      return id;
    }

    // 2. Try localStorage
    id = localStorage.getItem(VISITOR_KEY);
    if (id) {
      // Backup to sessionStorage
      try {
        sessionStorage.setItem(VISITOR_SESSION_KEY, id);
      } catch {}
      return id;
    }

    // 3. Generate new
    id = generateVisitorId();
    localStorage.setItem(VISITOR_KEY, id);
    try {
      sessionStorage.setItem(VISITOR_SESSION_KEY, id);
    } catch {}
    console.log(
      "[TRACKER] New visitorId generated:",
      id.substring(0, 8) + "...",
    );
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
  const ua = navigator.userAgent;

  if (
    /bot|crawl|spider|slurp|bingbot|googlebot|yandex|baidu|duckduck|facebookexternalhit|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|anthropic|applebot|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|pingdom|uptimerobot|headlesschrome|phantomjs|puppeteer|selenium|webdriver/i.test(
      ua,
    )
  ) {
    return true;
  }

  if (navigator.webdriver) return true;

  if (
    /chrome/i.test(ua) &&
    navigator.plugins &&
    navigator.plugins.length === 0
  ) {
    return true;
  }

  const chromeVer = ua.match(/Chrome\/(\d+)/);
  if (chromeVer && parseInt(chromeVer[1], 10) < 120) return true;

  if (window.screen.width === 0 || window.screen.height === 0) return true;

  return false;
}

/** Check if current page is a payment return (success page) */
function isPaymentReturn(): boolean {
  const path = window.location.pathname;
  return (
    path.startsWith("/checkout/sukces") || path.startsWith("/zamowienie/sukces")
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
  botSignals?: string[];
} {
  const rawSearch = window.location.search.replace(/&amp;/g, "&");
  const params = new URLSearchParams(rawSearch);

  const botSignals: string[] = [];
  if (navigator.webdriver) botSignals.push("webdriver");
  if (
    navigator.plugins &&
    navigator.plugins.length === 0 &&
    /chrome/i.test(navigator.userAgent)
  ) {
    botSignals.push("no_plugins");
  }
  const cv = navigator.userAgent.match(/Chrome\/(\d+)/);
  if (cv && parseInt(cv[1], 10) < 120) botSignals.push("stale_chrome_" + cv[1]);
  if (!navigator.languages || navigator.languages.length === 0)
    botSignals.push("no_languages");
  if (window.outerWidth === 0 && window.outerHeight === 0)
    botSignals.push("zero_outer");

  return {
    referrer: document.referrer || undefined,
    srsltid: params.get("srsltid") || undefined,
    gclid: params.get("gclid") || undefined,
    utm_source: params.get("utm_source") || undefined,
    utm_medium: params.get("utm_medium") || undefined,
    utm_campaign: params.get("utm_campaign") || undefined,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    botSignals: botSignals.length > 0 ? botSignals : undefined,
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

  // ── DIAGNOSTIC LOG ──
  console.log(
    `[TRACKER] send: type=${type}, page=${page}, vid=${payload.visitorId.substring(0, 8)}..., hasMeta=${includeSessionMeta}`,
    data || "",
  );

  const url = `${API_URL}/api/analytics/event`;
  const body = JSON.stringify(payload);

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

    const vid = getVisitorId();
    console.log(
      `[TRACKER] init: path=${window.location.pathname}, vid=${vid.substring(0, 8)}..., isPaymentReturn=${isPaymentReturn()}`,
    );

    // ── PAYMENT RETURN PAGE — DON'T create new session ──
    // On /checkout/sukces, we skip sessionMeta so backend finds existing session
    // instead of creating a new "direct" session.
    // Order tracking is handled ONLY by CheckoutSuccess component.
    if (isPaymentReturn()) {
      console.log(
        "[TRACKER] Payment return detected — sending page_view WITHOUT sessionMeta (reuse existing session)",
      );
      send("page_view", window.location.pathname + window.location.search);
      // NO auto-detect order_complete here — CheckoutSuccess handles it
      // Start heartbeat but don't do product detection etc.
      heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
      window.addEventListener("beforeunload", () => {
        sendHeartbeat();
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      });
      return;
    }

    // ── NORMAL PAGE — full tracking ──
    const cleanPage = (
      window.location.pathname + window.location.search
    ).replace(/&amp;/g, "&");
    send("page_view", cleanPage, undefined, true); // includeSessionMeta = true → new session if needed

    // Auto-detect product page view
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    if (
      pathParts.length === 2 &&
      !pathParts[0].startsWith("admin") &&
      !pathParts[0].startsWith("checkout") &&
      !pathParts[0].startsWith("zamowienie")
    ) {
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

    // ── REMOVED: auto-detect /checkout/sukces ──
    // Previously this fired order_complete here, duplicating CheckoutSuccess.
    // Now ONLY CheckoutSuccess.tsx handles order_complete tracking.

    // Heartbeat
    heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    window.addEventListener("beforeunload", () => {
      sendHeartbeat();
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    });

    // Track SPA-like navigation (Astro view transitions)
    document.addEventListener("astro:page-load", () => {
      send("page_view", window.location.pathname + window.location.search);
    });
  },

  /**
   * Save checkout context BEFORE payment redirect (Stripe).
   * Call this right before window.location.href = stripeUrl
   */
  saveCheckoutContext(): void {
    try {
      const ctx = {
        visitorId: getVisitorId(),
        timestamp: Date.now(),
      };
      sessionStorage.setItem(CHECKOUT_CONTEXT_KEY, JSON.stringify(ctx));
      // Also ensure visitorId is in sessionStorage
      sessionStorage.setItem(VISITOR_SESSION_KEY, ctx.visitorId);
      console.log(
        "[TRACKER] Checkout context saved before payment redirect:",
        ctx.visitorId.substring(0, 8) + "...",
      );
    } catch (e) {
      console.warn("[TRACKER] Failed to save checkout context:", e);
    }
  },

  /**
   * Check if order was already tracked in this page session (dedup).
   * Returns true if this orderId was already tracked.
   */
  wasOrderTracked(orderId: string): boolean {
    try {
      const tracked = sessionStorage.getItem(ORDER_TRACKED_KEY);
      return tracked === orderId;
    } catch {
      return false;
    }
  },

  /**
   * Mark order as tracked (dedup).
   */
  markOrderTracked(orderId: string): void {
    try {
      sessionStorage.setItem(ORDER_TRACKED_KEY, orderId);
    } catch {}
  },

  /** Get current visitor ID (for passing to order API) */
  getVisitorId(): string {
    return getVisitorId();
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

  /**
   * Track order complete — with dedup.
   * Only fires if this orderId hasn't been tracked yet in this session.
   */
  orderComplete(data: {
    orderId: string;
    orderValue: number;
    itemCount: number;
  }): void {
    if (this.wasOrderTracked(data.orderId)) {
      console.log(
        "[TRACKER] orderComplete SKIPPED — already tracked:",
        data.orderId,
      );
      return;
    }
    console.log(
      "[TRACKER] orderComplete FIRING:",
      data.orderId,
      "value:",
      data.orderValue,
    );
    send("order_complete", window.location.pathname, data);
    this.markOrderTracked(data.orderId);
  },

  /** Track search */
  search(query: string, resultCount: number): void {
    send("search", window.location.pathname, { query, resultCount });
  },
};
