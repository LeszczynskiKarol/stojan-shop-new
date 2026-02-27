/**
 * CookieConsent — banner + modal ustawień
 * GDPR/RODO + Google Consent Mode v2
 *
 * Usage:
 *   <CookieConsent client:load />
 *
 * Reopen from anywhere:
 *   window.openCookieSettings()
 *   or: document.dispatchEvent(new Event("open-cookie-settings"))
 */

import { useState, useEffect, useCallback } from "react";
import {
  getSavedConsent,
  shouldShowBanner,
  acceptAll,
  rejectAll,
  saveCustom,
  type ConsentState,
} from "../lib/consent";

// ============================================
// COMPONENT
// ============================================

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    // Check if banner should show
    const saved = getSavedConsent();
    if (!saved) {
      // Small delay for smoother UX — don't flash banner before page renders
      const t = setTimeout(() => {
        setVisible(true);
        requestAnimationFrame(() => setAnimate(true));
      }, 800);
      return () => clearTimeout(t);
    } else {
      setAnalytics(saved.analytics);
      setMarketing(saved.marketing);
    }
  }, []);

  // Listen for reopen event (from footer link)
  useEffect(() => {
    const openSettings = () => {
      const saved = getSavedConsent();
      if (saved) {
        setAnalytics(saved.analytics);
        setMarketing(saved.marketing);
      }
      setShowSettings(true);
      setVisible(true);
      requestAnimationFrame(() => setAnimate(true));
    };

    // Global function
    window.openCookieSettings = openSettings;

    // Event-based
    document.addEventListener("open-cookie-settings", openSettings);
    return () =>
      document.removeEventListener("open-cookie-settings", openSettings);
  }, []);

  const close = useCallback(() => {
    setAnimate(false);
    setTimeout(() => {
      setVisible(false);
      setShowSettings(false);
    }, 300);
  }, []);

  const handleAcceptAll = () => {
    acceptAll();
    close();
  };

  const handleRejectAll = () => {
    rejectAll();
    close();
  };

  const handleSaveCustom = () => {
    saveCustom(analytics, marketing);
    close();
  };

  if (!visible) return null;

  return (
    <>
      {/* Backdrop for settings modal */}
      {showSettings && (
        <div
          className={`fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
            animate ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setShowSettings(false)}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div
          className={`fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4 transition-all duration-300 ${
            animate ? "opacity-100" : "opacity-0"
          }`}
          role="dialog"
          aria-modal="true"
          aria-label="Ustawienia plików cookie"
          onClick={() => setShowSettings(false)}
        >
          <div
            className={`w-full sm:max-w-lg bg-[#1a1a2e] border border-[#2a2a4a] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col transition-transform duration-300 ${
              animate ? "translate-y-0" : "translate-y-full sm:translate-y-4"
            }`}
            style={{ boxSizing: "border-box", maxWidth: "100vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-[#2a2a4a] flex-shrink-0">
              <div className="flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-semibold text-white">
                  Ustawienia plików cookie
                </h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Zamknij"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M4 4l8 8M12 4l-8 8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
              <p className="text-xs sm:text-sm text-gray-400 mt-2 leading-relaxed">
                Wybierz, które kategorie plików cookie chcesz włączyć. Możesz
                zmienić swoje preferencje w&nbsp;dowolnym momencie.
              </p>
            </div>

            {/* Categories */}
            <div className="px-4 sm:px-6 py-4 space-y-1 overflow-y-auto flex-1">
              {/* Necessary */}
              <CategoryToggle
                title="Niezbędne"
                description="Wymagane do działania sklepu: sesja, koszyk, uwierzytelnianie, preferencje zgód. Nie można wyłączyć."
                checked={true}
                disabled={true}
                cookies={["session_id", "cart", "cookie_consent"]}
              />

              {/* Analytics */}
              <CategoryToggle
                title="Analityczne"
                description="Google Analytics 4 — anonimowe statystyki odwiedzin, ścieżki użytkowników, czas na stronie. Pomagają ulepszać sklep."
                checked={analytics}
                onChange={setAnalytics}
                cookies={["_ga", "_ga_*", "_gid"]}
              />

              {/* Marketing */}
              <CategoryToggle
                title="Marketingowe"
                description="Google Ads — śledzenie konwersji, remarketing, personalizacja reklam. Umożliwiają wyświetlanie trafnych reklam."
                checked={marketing}
                onChange={setMarketing}
                cookies={["_gcl_au", "_gcl_aw", "_gac_*"]}
              />
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "12px 16px",
                borderTop: "1px solid #2a2a4a",
                flexShrink: 0,
              }}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    onClick={handleRejectAll}
                    style={{
                      flex: 1,
                      height: "38px",
                      borderRadius: "8px",
                      background: "transparent",
                      color: "#d1d5db",
                      fontSize: "12px",
                      border: "1px solid #3a3a5a",
                      cursor: "pointer",
                    }}
                  >
                    Odrzuć opcjonalne
                  </button>
                  <button
                    onClick={handleSaveCustom}
                    style={{
                      flex: 1,
                      height: "38px",
                      borderRadius: "8px",
                      background: "#4f46e5",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: 600,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Zapisz wybór
                  </button>
                </div>
                <button
                  onClick={handleAcceptAll}
                  style={{
                    width: "100%",
                    height: "38px",
                    borderRadius: "8px",
                    background: "#fff",
                    color: "#111",
                    fontSize: "12px",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Akceptuj wszystkie
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Banner */}
      {!showSettings && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-[9999] overflow-hidden transition-transform duration-500 ease-out ${
            animate ? "translate-y-0" : "translate-y-full"
          }`}
          role="dialog"
          aria-label="Zgoda na pliki cookie"
          style={{ maxWidth: "100vw" }}
        >
          <div style={{ padding: "8px", maxWidth: "1024px", margin: "0 auto" }}>
            <div
              style={{
                background: "#1a1a2e",
                border: "1px solid #2a2a4a",
                borderRadius: "12px",
                padding: "12px",
                boxShadow: "0 -4px 30px rgba(0,0,0,0.4)",
              }}
            >
              {/* Text */}
              <div
                style={{ display: "flex", gap: "8px", marginBottom: "12px" }}
              >
                <span
                  style={{ fontSize: "18px", flexShrink: 0 }}
                  aria-hidden="true"
                >
                  🍪
                </span>
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#fff",
                      marginBottom: "2px",
                    }}
                  >
                    Ta strona używa plików cookie
                  </p>
                  <p
                    style={{
                      fontSize: "11px",
                      color: "#9ca3af",
                      lineHeight: 1.4,
                    }}
                  >
                    Używamy cookie niezbędnych oraz opcjonalnych analitycznych i
                    marketingowych.{" "}
                    <a
                      href="/polityka-prywatnosci"
                      style={{ color: "#818cf8", textDecoration: "underline" }}
                    >
                      Polityka prywatności
                    </a>
                  </p>
                </div>
              </div>

              {/* Buttons — full width stack */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <button
                  onClick={handleAcceptAll}
                  style={{
                    height: "38px",
                    borderRadius: "8px",
                    background: "#4f46e5",
                    color: "#fff",
                    fontSize: "12px",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  Akceptuj wszystkie
                </button>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    onClick={handleRejectAll}
                    style={{
                      flex: 1,
                      height: "38px",
                      borderRadius: "8px",
                      background: "transparent",
                      color: "#d1d5db",
                      fontSize: "12px",
                      border: "1px solid #3a3a5a",
                      cursor: "pointer",
                    }}
                  >
                    Odrzuć opcjonalne
                  </button>
                  <button
                    onClick={() => setShowSettings(true)}
                    style={{
                      flex: 1,
                      height: "38px",
                      borderRadius: "8px",
                      background: "transparent",
                      color: "#d1d5db",
                      fontSize: "12px",
                      border: "1px solid #3a3a5a",
                      cursor: "pointer",
                    }}
                  >
                    Ustawienia
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================
// CATEGORY TOGGLE
// ============================================

function CategoryToggle({
  title,
  description,
  checked,
  disabled,
  onChange,
  cookies,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
  cookies: string[];
}) {
  return (
    <div
      className={`rounded-xl p-3 sm:p-4 transition-colors ${
        checked
          ? "bg-indigo-500/8 border border-indigo-500/20"
          : "bg-white/3 border border-transparent"
      }`}
    >
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs sm:text-sm font-medium text-white">
              {title}
            </span>
            {disabled && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 uppercase tracking-wider font-medium">
                Zawsze aktywne
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">{description}</p>
          <p className="text-[10px] text-gray-500 mt-1.5">
            Pliki cookie: {cookies.join(", ")}
          </p>
        </div>

        {/* Toggle */}
        <button
          role="switch"
          aria-checked={checked}
          aria-label={`${title} ${checked ? "włączone" : "wyłączone"}`}
          disabled={disabled}
          onClick={() => onChange?.(!checked)}
          className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1a2e] ${
            disabled
              ? "bg-green-600/40 cursor-not-allowed"
              : checked
                ? "bg-indigo-600 cursor-pointer"
                : "bg-gray-600 cursor-pointer hover:bg-gray-500"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
              checked ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
