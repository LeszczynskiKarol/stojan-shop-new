// frontend/src/components/CookieConsent.tsx

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
  acceptAll,
  rejectAll,
  saveCustom,
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
          className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${
            animate ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
          role="dialog"
          aria-modal="true"
          aria-label="Ustawienia plików cookie"
        >
          <div
            className="w-full max-w-lg bg-[#1a1a2e] border border-[#2a2a4a] rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-[#2a2a4a]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">
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
              <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                Wybierz, które kategorie plików cookie chcesz włączyć. Możesz
                zmienić swoje preferencje w&nbsp;dowolnym momencie.
              </p>
            </div>

            {/* Categories */}
            <div className="px-6 py-4 space-y-1 max-h-[60vh] overflow-y-auto">
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
            <div className="px-6 py-4 border-t border-[#2a2a4a] flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleRejectAll}
                className="flex-1 h-11 rounded-xl border border-[#3a3a5a] text-sm text-gray-300 hover:bg-white/5 transition-colors"
              >
                Odrzuć opcjonalne
              </button>
              <button
                onClick={handleSaveCustom}
                className="flex-1 h-11 rounded-xl bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
              >
                Zapisz wybór
              </button>
              <button
                onClick={handleAcceptAll}
                className="flex-1 h-11 rounded-xl bg-white text-sm font-medium text-gray-900 hover:bg-gray-100 transition-colors"
              >
                Akceptuj wszystkie
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Banner */}
      {!showSettings && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-[9999] transition-transform duration-500 ease-out ${
            animate ? "translate-y-0" : "translate-y-full"
          }`}
          role="dialog"
          aria-label="Zgoda na pliki cookie"
        >
          <div className="mx-auto max-w-5xl px-4 pb-4">
            <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-2xl shadow-2xl shadow-black/40 p-5 sm:p-6">
              <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 lg:items-center">
                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-3">
                    <span
                      className="text-2xl flex-shrink-0 mt-0.5"
                      aria-hidden="true"
                    >
                      🍪
                    </span>
                    <div>
                      <h2 className="text-base font-semibold text-white mb-1.5">
                        Ta strona używa plików cookie
                      </h2>
                      <p className="text-sm text-gray-400 leading-relaxed">
                        Używamy plików cookie niezbędnych do działania sklepu
                        oraz opcjonalnych cookie analitycznych
                        i&nbsp;marketingowych. Szczegóły znajdziesz
                        w&nbsp;naszej{" "}
                        <a
                          href="/polityka-prywatnosci"
                          className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                        >
                          polityce prywatności
                        </a>
                        .
                      </p>
                    </div>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-2 lg:flex-shrink-0">
                  <button
                    onClick={() => setShowSettings(true)}
                    className="h-11 px-5 rounded-xl border border-[#3a3a5a] text-sm text-gray-300 hover:bg-white/5 transition-colors whitespace-nowrap order-3 sm:order-1"
                  >
                    Ustawienia
                  </button>
                  <button
                    onClick={handleRejectAll}
                    className="h-11 px-5 rounded-xl border border-[#3a3a5a] text-sm text-gray-300 hover:bg-white/5 transition-colors whitespace-nowrap order-2"
                  >
                    Odrzuć opcjonalne
                  </button>
                  <button
                    onClick={handleAcceptAll}
                    className="h-11 px-6 rounded-xl bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-500 transition-colors whitespace-nowrap order-1 sm:order-3"
                  >
                    Akceptuj wszystkie
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
      className={`rounded-xl p-4 transition-colors ${
        checked
          ? "bg-indigo-500/8 border border-indigo-500/20"
          : "bg-white/3 border border-transparent"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-white">{title}</span>
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
