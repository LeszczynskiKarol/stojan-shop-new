// frontend/src/components/admin/ShipmentConfirmation.tsx
// Port 1:1 ze starego Next.js – animacje CSS zamiast framer-motion
import { useState } from "react";

interface ShipmentConfirmationProps {
  orderId: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ShipmentConfirmation({
  orderId,
  onClose,
  onConfirm,
}: ShipmentConfirmationProps) {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirmWithAnimation = async () => {
    setIsConfirmed(true);

    setTimeout(() => {
      setIsConfirmed(false);
      setIsLoading(true);
      onConfirm().finally(() => {
        setIsLoading(false);
        onClose();
      });
    }, 4000);
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9998]"
        onClick={() => !isConfirmed && !isLoading && onClose()}
        style={{ animation: "scFadeIn .2s ease" }}
      >
        {/* Modal */}
        <div
          className="bg-[hsl(var(--card))] dark:bg-gray-800 rounded-xl shadow-xl mx-4 relative overflow-hidden"
          style={{
            width: isConfirmed ? "800px" : "400px",
            height: isConfirmed ? "500px" : "auto",
            padding: "2rem",
            transition: "width .4s ease, height .4s ease",
            animation: "scSlideUp .3s ease",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {isConfirmed ? (
            /* === ANIMATION PHASE === */
            <div className="relative w-full h-full">
              {/* Flying package */}
              <div className="sc-package">📦</div>

              {/* Houston text */}
              <div className="sc-houston">Houston, mamy wysyłkę! 👨‍🚀</div>

              {/* Smoke */}
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={`smoke-${i}`}
                  className="sc-smoke"
                  style={{
                    animationDelay: `${i * 0.2}s`,
                    left: `${-50 + i * 30}px`,
                  }}
                >
                  💨
                </div>
              ))}

              {/* Confetti */}
              {Array.from({ length: 30 }).map((_, i) => (
                <div
                  key={`confetti-${i}`}
                  className="sc-confetti"
                  style={{
                    animationDelay: `${Math.random() * 2}s`,
                    left: `${50 + Math.random() * 80}%`,
                    top: `${20 + Math.random() * 60}%`,
                  }}
                >
                  {
                    ["🌟", "✨", "💫", "⭐️", "🎉", "🎊"][
                      Math.floor(Math.random() * 6)
                    ]
                  }
                </div>
              ))}

              {/* End message */}
              <div className="sc-end-msg">
                <p className="text-2xl font-bold mb-2">
                  Mission accomplished! 🎯
                </p>
                <p className="text-lg text-gray-500 dark:text-gray-400">
                  Paczka mknie do klienta szybciej niż Sputnik! 🛸
                </p>
              </div>
            </div>
          ) : isLoading ? (
            /* === LOADING PHASE === */
            <div className="flex flex-col items-center justify-center p-8 space-y-4">
              <div className="sc-spinner">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-[hsl(var(--primary))]"
                >
                  <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
                  <path d="M15 18H9" />
                  <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
                  <circle cx="17" cy="18" r="2" />
                  <circle cx="7" cy="18" r="2" />
                </svg>
              </div>
              <p className="text-lg font-medium text-[hsl(var(--foreground))]">
                Finalizowanie wysyłki...
              </p>
            </div>
          ) : (
            /* === CONFIRMATION PHASE === */
            <div className="space-y-4">
              <div className="text-center space-y-4">
                <div className="text-4xl">🚚 💨 📦</div>
                <h3 className="text-xl font-bold text-[hsl(var(--foreground))]">
                  Czas wypuścić paczkę w świat! 🌍
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Na pewno zakończyć zamówienie i wysłać do klienta wiadomość o
                  wysyłce produktu?
                </p>
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleConfirmWithAnimation}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 active:scale-95 transition-all"
                >
                  ✨ Tak, leć paczuszko!
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-[hsl(var(--foreground))] rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 active:scale-95 transition-all"
                >
                  🤔 Nie, jeszcze nie teraz
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes scFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scSlideUp { from { opacity: 0; transform: translateY(50px) } to { opacity: 1; transform: translateY(0) } }

        .sc-package {
          position: absolute;
          font-size: 3.5rem;
          z-index: 10;
          animation: scFlyPackage 3.5s ease-in-out forwards;
        }
        @keyframes scFlyPackage {
          0% { left: -100px; top: 150px; transform: scale(1) rotate(0deg); }
          25% { top: 50px; transform: scale(1.2) rotate(-15deg); }
          50% { top: 150px; transform: scale(1) rotate(15deg); }
          75% { top: 50px; transform: scale(1.2) rotate(-15deg); }
          100% { left: 650px; top: 150px; transform: scale(1) rotate(0deg); }
        }

        .sc-houston {
          position: absolute;
          width: 100%;
          text-align: center;
          font-size: 1.5rem;
          font-weight: bold;
          animation: scHouston 2s ease forwards;
        }
        @keyframes scHouston {
          0% { top: -100px; opacity: 0; }
          20% { top: 100px; opacity: 1; }
          80% { top: 100px; opacity: 1; }
          100% { top: 100px; opacity: 0; }
        }

        .sc-smoke {
          position: absolute;
          font-size: 2rem;
          top: 150px;
          opacity: 0;
          animation: scSmoke 2s ease-out forwards;
        }
        @keyframes scSmoke {
          0% { opacity: 0; transform: scale(0.5); }
          30% { opacity: 1; }
          100% { opacity: 0; transform: scale(1.5) translateX(80px) translateY(-50px); }
        }

        .sc-confetti {
          position: absolute;
          font-size: 1.5rem;
          opacity: 0;
          animation: scConfetti 3s ease-out forwards;
        }
        @keyframes scConfetti {
          0% { opacity: 0; transform: scale(0); }
          30% { opacity: 1; transform: scale(1) rotate(0deg); }
          100% { opacity: 0; transform: scale(0.5) rotate(360deg) translateY(-100px); }
        }

        .sc-end-msg {
          position: absolute;
          bottom: 2rem;
          left: 0;
          right: 0;
          text-align: center;
          opacity: 0;
          animation: scEndMsg .5s ease forwards;
          animation-delay: 2.5s;
        }
        @keyframes scEndMsg {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .sc-spinner {
          animation: scSpin 1s linear infinite;
        }
        @keyframes scSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
