import type { User } from "@supabase/supabase-js";

/** True when Sign in with Apple is the primary auth identity for this session. */
export function isApplePrimaryIdentity(user: User | null | undefined): boolean {
  if (!user) return false;

  const identities = user.identities ?? [];
  if (identities.some((identity) => identity.provider === "apple")) return true;

  const appMeta = user.app_metadata as { provider?: string; providers?: string[] } | undefined;
  if (appMeta?.provider === "apple") return true;
  if (Array.isArray(appMeta?.providers) && appMeta.providers.includes("apple")) return true;

  return false;
}

/** Non-blocking display fallback when Apple omits name on later sign-ins. */
export function appleDisplayNameFallback(user: User | null | undefined): string {
  const meta = user?.user_metadata as { full_name?: string } | undefined;
  const fromMeta = typeof meta?.full_name === "string" ? meta.full_name.trim() : "";
  if (fromMeta) return fromMeta;

  const email = user?.email?.trim();
  if (email) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }

  return "Apple user";
}
