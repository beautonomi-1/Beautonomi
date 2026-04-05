import { api } from "@/lib/api-client";

let retentionSyncTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 1500;

/**
 * Clears inactivity retention countdown when auth proves a login after the warning (POST /api/me/retention/sync-on-login).
 */
export function scheduleRetentionSyncOnSession(): void {
  if (retentionSyncTimer) clearTimeout(retentionSyncTimer);
  retentionSyncTimer = setTimeout(() => {
    retentionSyncTimer = null;
    void api.post("/api/me/retention/sync-on-login", {}).catch(() => {});
  }, DEBOUNCE_MS);
}
