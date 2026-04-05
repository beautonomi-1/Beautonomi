import { getCsrfHeaders } from "@/lib/csrf";

/**
 * Fire-and-forget: clear inactivity retention countdown when session proves a login after the warning.
 * Web only (cookie session).
 *
 * Uses `/api/me/*` — that prefix means "current session user", not "customer app only". Providers and
 * admins hit the same routes where the product applies (e.g. retention, account status). Deferred
 * with idle callback so provider dashboard first paint is not competing with this POST in dev.
 */
export function scheduleRetentionSyncOnSession(): void {
  if (typeof window === "undefined") return;
  const run = () => {
    void fetch("/api/me/retention/sync-on-login", {
      method: "POST",
      headers: getCsrfHeaders(),
      credentials: "include",
    }).catch(() => {});
  };
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(() => run(), { timeout: 15_000 });
  } else {
    setTimeout(run, 2_000);
  }
}
