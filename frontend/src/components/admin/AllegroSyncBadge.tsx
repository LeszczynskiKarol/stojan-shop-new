// frontend/src/components/admin/AllegroSyncBadge.tsx
// Small badge + sync button for each product row in ProductsTable
// Shows: linked/not linked status, manual sync trigger

import { useState } from "react";
import { RefreshCw, ExternalLink, Loader2, Link2Off } from "lucide-react";

const API = import.meta.env.PUBLIC_API_URL || "http://localhost:4000";

interface Props {
  productId: string;
  allegroData?: {
    productId?: string;
    active?: boolean;
    price?: number;
    url?: string;
    lastSyncAt?: string;
  } | null;
}

export default function AllegroSyncBadge({ productId, allegroData }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [syncOk, setSyncOk] = useState<boolean | null>(null);

  const isLinked = !!allegroData?.productId;

  const getAuthCookie = () => {
    const match = document.cookie.match(/(?:^|; )admin_token=([^;]*)/);
    return match ? match[1] : "";
  };

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSyncing(true);
    setSyncOk(null);
    try {
      const token = getAuthCookie();
      const res = await fetch(`${API}/api/allegro/sync-product/${productId}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      setSyncOk(data.success ?? false);
      setTimeout(() => setSyncOk(null), 3000);
    } catch {
      setSyncOk(false);
      setTimeout(() => setSyncOk(null), 3000);
    } finally {
      setSyncing(false);
    }
  };

  if (!isLinked) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
        <Link2Off className="h-3 w-3" />
        <span className="hidden sm:inline">—</span>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Status dot */}
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          allegroData?.active ? "bg-green-500" : "bg-gray-400"
        }`}
        title={allegroData?.active ? "Aktywna" : "Nieaktywna"}
      />

      {/* Allegro link */}
      {allegroData?.url && (
        <a
          href={allegroData.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-orange-600 hover:text-orange-700"
          title="Otwórz na Allegro"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {/* Sync button */}
      <button
        onClick={handleSync}
        disabled={syncing}
        className={`rounded p-0.5 transition-colors ${
          syncOk === true
            ? "text-green-600"
            : syncOk === false
              ? "text-red-500"
              : "text-gray-400 hover:text-gray-600"
        }`}
        title="Synchronizuj z Allegro"
      >
        {syncing ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}
