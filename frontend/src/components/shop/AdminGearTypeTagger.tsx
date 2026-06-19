// Admin-only widget do tagowania typu przekładni motoreduktora.
// Widoczny TYLKO dla zalogowanego admina (flaga localStorage 'admin_logged_in',
// to samo źródło prawdy co link do panelu w BaseLayout). Zapis idzie przez
// PUT /api/admin/products/:id (chronione cookie admin_session, credentials:include).
// Renderuje się tylko na publicznych URL-ach produktów z kategorii motoreduktory.
import { useState, useEffect } from "react";

const OPTIONS: { value: string; label: string }[] = [
  { value: "walcowe-proste", label: "Walcowe proste" },
  { value: "walcowe-plaskie", label: "Walcowe płaskie" },
  { value: "walcowo-stozkowe", label: "Walcowo-stożkowe" },
];

const LABELS: Record<string, string> = Object.fromEntries(
  OPTIONS.map((o) => [o.value, o.label]),
);

export default function AdminGearTypeTagger({
  productId,
  initialGearType,
}: {
  productId: string;
  initialGearType: string | null;
}) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [value, setValue] = useState<string | null>(initialGearType);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem("admin_logged_in") === "1") setIsAdmin(true);
    } catch {}
  }, []);

  if (!isAdmin) return null;

  const API = (import.meta as any).env?.PUBLIC_API_URL || "";

  const save = async (next: string | null) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`${API}/api/admin/products/${productId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gearType: next }),
      });
      if (!r.ok)
        throw new Error(
          r.status === 401
            ? "Brak autoryzacji — zaloguj się w /admin"
            : `Błąd zapisu (${r.status})`,
        );
      setValue(next);
      setMsg({ text: next ? "Zapisano ✓" : "Odznaczono ✓", ok: true });
    } catch (e: any) {
      setMsg({ text: e?.message || "Błąd zapisu", ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        border: "1px dashed #b45309",
        background: "rgba(245,158,11,0.10)",
        borderRadius: 10,
        padding: "10px 14px",
        margin: "0 0 16px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
      }}
    >
      <span style={{ fontWeight: 700, color: "#b45309" }}>
        🔧 Admin · typ przekładni
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {OPTIONS.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              disabled={busy}
              onClick={() => save(active ? null : o.value)}
              title={active ? "Kliknij, aby odznaczyć" : "Oznacz ten typ"}
              style={{
                padding: "5px 12px",
                borderRadius: 999,
                border: active ? "1px solid #b45309" : "1px solid #d1d5db",
                background: active ? "#b45309" : "#fff",
                color: active ? "#fff" : "#374151",
                cursor: busy ? "default" : "pointer",
                fontWeight: active ? 700 : 500,
                opacity: busy ? 0.6 : 1,
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <span style={{ color: "#6b7280" }}>
        Aktualnie:{" "}
        <strong style={{ color: value ? "#b45309" : "#9ca3af" }}>
          {value ? LABELS[value] || value : "nieoznaczony"}
        </strong>
      </span>
      {msg && (
        <span style={{ color: msg.ok ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
