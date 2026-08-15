/**
 * Readiness signal for `/api/provider/*` routes guarded by `requireRoleInApi`.
 *
 * Those routes answer 403 FORBIDDEN while `users.role` is still `customer` or
 * `provider_onboarding`, which is the normal state for the whole signup wizard.
 * Polling them anyway produced a steady stream of 403s (nav-counts,
 * notifications, notification-preferences, devices) for every user in
 * onboarding, so pollers and retry timers gate on this instead of `!!session`.
 *
 * `ProviderContext` owns the value; consumers that sit above it in the tree, or
 * outside React entirely, read it through here.
 */

const PROVIDER_API_ROLES = new Set(["provider_owner", "provider_staff", "superadmin"]);

export function isProviderApiRole(role: string | null | undefined): boolean {
  return !!role && PROVIDER_API_ROLES.has(role);
}

let ready = false;
const listeners = new Set<(ready: boolean) => void>();

export function isProviderApiReady(): boolean {
  return ready;
}

export function setProviderApiReady(next: boolean): void {
  if (next === ready) return;
  ready = next;
  for (const listener of listeners) {
    try {
      listener(ready);
    } catch {
      // A misbehaving listener must not break role propagation.
    }
  }
}

export function subscribeProviderApiReady(listener: (ready: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
