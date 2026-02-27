// frontend/src/lib/consent.ts

/**
 * Cookie Consent Manager
 * GDPR/RODO + Google Consent Mode v2
 *
 * Categories:
 *   - necessary: Always on (session, cart, auth, consent cookie itself)
 *   - analytics: GA4 (G-VPV7V6L3KW)
 *   - marketing: Google Ads, remarketing, ad personalization
 */

// ============================================
// TYPES
// ============================================

export type ConsentCategory = "necessary" | "analytics" | "marketing";

export interface ConsentState {
  necessary: boolean; // always true
  analytics: boolean;
  marketing: boolean;
  timestamp: string; // ISO date — proof of consent
  version: number; // consent version for re-prompting
}

export interface ConsentConfig {
  ga4Id: string;
  adsId?: string; // AW-XXXXXXX
  adsLabel?: string; // conversion label
}

// ============================================
// CONSTANTS
// ============================================

const CONSENT_COOKIE = "cookie_consent";
const CONSENT_VERSION = 1; // Bump to re-prompt all users
const CONSENT_EXPIRY_DAYS = 365; // RODO: max 13 months recommended
const CONSENT_EVENT = "consent-updated";

// ============================================
// COOKIE HELPERS
// ============================================

function setCookie(name: string, value: string, days: number): void {
  const d = new Date();
  d.setTime(d.getTime() + days * 86400000);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax;Secure`;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function deleteCookie(name: string): void {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax;Secure`;
}

// ============================================
// CONSENT STATE
// ============================================

/** Read saved consent from cookie */
export function getSavedConsent(): ConsentState | null {
  try {
    const raw = getCookie(CONSENT_COOKIE);
    if (!raw) return null;
    const state: ConsentState = JSON.parse(raw);
    // Re-prompt if consent version changed
    if (state.version !== CONSENT_VERSION) return null;
    return state;
  } catch {
    return null;
  }
}

/** Save consent to cookie */
export function saveConsent(
  state: Omit<ConsentState, "timestamp" | "version" | "necessary">,
): ConsentState {
  const full: ConsentState = {
    necessary: true,
    analytics: state.analytics,
    marketing: state.marketing,
    timestamp: new Date().toISOString(),
    version: CONSENT_VERSION,
  };
  setCookie(CONSENT_COOKIE, JSON.stringify(full), CONSENT_EXPIRY_DAYS);

  // Update Google Consent Mode
  updateGoogleConsent(full);

  // Dispatch event for UI updates
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: full }));

  return full;
}

/** Check if consent banner should show */
export function shouldShowBanner(): boolean {
  return getSavedConsent() === null;
}

/** Accept all */
export function acceptAll(): ConsentState {
  return saveConsent({ analytics: true, marketing: true });
}

/** Reject all (necessary only) */
export function rejectAll(): ConsentState {
  // Clean up tracking cookies when rejecting
  cleanupTrackingCookies();
  return saveConsent({ analytics: false, marketing: false });
}

/** Save custom choices */
export function saveCustom(
  analytics: boolean,
  marketing: boolean,
): ConsentState {
  if (!analytics) cleanupAnalyticsCookies();
  if (!marketing) cleanupMarketingCookies();
  return saveConsent({ analytics, marketing });
}

/** Withdraw all consent (for "forget me" requests) */
export function withdrawConsent(): void {
  cleanupTrackingCookies();
  deleteCookie(CONSENT_COOKIE);
  updateGoogleConsent({
    necessary: true,
    analytics: false,
    marketing: false,
    timestamp: new Date().toISOString(),
    version: CONSENT_VERSION,
  });
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: null }));
}

// ============================================
// GOOGLE CONSENT MODE V2
// ============================================

/**
 * Initialize Google Consent Mode v2 with default DENIED state.
 * This MUST run before any gtag/GTM scripts load.
 * Called from the inline <script> in <head>.
 */
export function initGoogleConsentDefaults(): void {
  // Initialize dataLayer
  window.dataLayer = window.dataLayer || [];
  function gtag(...args: any[]) {
    window.dataLayer.push(arguments);
  }

  // Set default consent — all denied until user makes a choice
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    functionality_storage: "granted", // necessary cookies
    personalization_storage: "denied",
    security_storage: "granted",
    wait_for_update: 500, // wait up to 500ms for consent
  });

  // Enable URL passthrough for better attribution without cookies
  gtag("set", "url_passthrough", true);

  // Enable ads data redaction when consent is denied
  gtag("set", "ads_data_redaction", true);

  // If user already consented, apply immediately
  const saved = getSavedConsent();
  if (saved) {
    updateGoogleConsent(saved);
  }
}

/** Update Google Consent Mode state */
function updateGoogleConsent(state: ConsentState): void {
  window.dataLayer = window.dataLayer || [];
  function gtag(...args: any[]) {
    window.dataLayer.push(arguments);
  }

  gtag("consent", "update", {
    ad_storage: state.marketing ? "granted" : "denied",
    ad_user_data: state.marketing ? "granted" : "denied",
    ad_personalization: state.marketing ? "granted" : "denied",
    analytics_storage: state.analytics ? "granted" : "denied",
  });
}

// ============================================
// COOKIE CLEANUP
// ============================================

function cleanupAnalyticsCookies(): void {
  // GA4 cookies
  const gaCookies = document.cookie
    .split(";")
    .map((c) => c.trim().split("=")[0]);
  for (const name of gaCookies) {
    if (name.startsWith("_ga") || name.startsWith("_gid")) {
      deleteCookie(name);
    }
  }
}

function cleanupMarketingCookies(): void {
  const adCookies = document.cookie
    .split(";")
    .map((c) => c.trim().split("=")[0]);
  for (const name of adCookies) {
    if (
      name.startsWith("_gcl") ||
      name.startsWith("_gac") ||
      name === "_fbp" ||
      name === "_fbc"
    ) {
      deleteCookie(name);
    }
  }
}

function cleanupTrackingCookies(): void {
  cleanupAnalyticsCookies();
  cleanupMarketingCookies();
}

// ============================================
// CONSENT EVENT LISTENER
// ============================================

export function onConsentChange(
  callback: (state: ConsentState | null) => void,
): () => void {
  const handler = (e: Event) => callback((e as CustomEvent).detail);
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
}

// ============================================
// TYPE AUGMENTATION
// ============================================

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
    openCookieSettings: () => void;
  }
}
