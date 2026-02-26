// backend/src/services/allegro-scheduler.ts
// Simple interval-based scheduler for Allegro sync tasks
// No external dependencies needed — uses setInterval
//
// NOTE: Only event polling runs automatically.
// Full reconciliation is triggered MANUALLY from admin panel only.

import { pollAllegroEvents } from "./allegro-sync.js";
import { isAllegroConnected } from "../lib/allegro-client.js";

let eventPollInterval: ReturnType<typeof setInterval> | null = null;

const EVENT_POLL_MS = 10 * 60 * 1000; // Poll events every 10 min

/**
 * Start Allegro background tasks.
 * Call this from index.ts after server starts.
 * Only event polling — reconciliation is manual only.
 */
export function startAllegroScheduler(): void {
  console.log("⏰ Starting Allegro scheduler (event polling only)...");

  // Event polling — every 10 minutes
  eventPollInterval = setInterval(async () => {
    try {
      const connected = await isAllegroConnected();
      if (!connected) return;

      const result = await pollAllegroEvents();
      if (result.synced > 0) {
        console.log(`📥 Allegro events: synced ${result.synced} changes`);
      }
      if (result.errors.length > 0) {
        console.warn(`⚠️ Allegro event errors:`, result.errors);
      }
    } catch (err: any) {
      console.error("❌ Allegro event poll error:", err.message);
    }
  }, EVENT_POLL_MS);

  // Also run event poll once shortly after startup (30s delay)
  setTimeout(async () => {
    try {
      const connected = await isAllegroConnected();
      if (connected) {
        console.log("📥 Initial Allegro event poll...");
        await pollAllegroEvents();
      } else {
        console.log(
          "ℹ️ Allegro not connected — scheduler will retry on intervals",
        );
      }
    } catch {
      // Silent — scheduler will retry
    }
  }, 30_000);
}

/**
 * Stop all Allegro background tasks.
 * Call this on graceful shutdown.
 */
export function stopAllegroScheduler(): void {
  if (eventPollInterval) clearInterval(eventPollInterval);
  eventPollInterval = null;
  console.log("⏰ Allegro scheduler stopped");
}
