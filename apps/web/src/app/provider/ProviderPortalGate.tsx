"use client";

import { useLayoutEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { useAuth } from "@/providers/AuthProvider";
import { isProviderOnboardingRouteAllowed } from "@/lib/provider/onboarding-route-allowlist";

const GATE_CACHE_KEY = "provider_gate_status";
const GATE_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const AUTH_RETRY_ATTEMPTS = 4;
const TRANSIENT_RETRY_ATTEMPTS = 4;

function readGateCache(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(GATE_CACHE_KEY);
    if (!raw) return false;
    const { ok, ts } = JSON.parse(raw) as { ok: boolean; ts: number };
    return ok && Date.now() - ts < GATE_CACHE_TTL;
  } catch {
    return false;
  }
}

function writeGateCache() {
  try {
    sessionStorage.setItem(GATE_CACHE_KEY, JSON.stringify({ ok: true, ts: Date.now() }));
  } catch { /* ignore */ }
}

function clearGateCache() {
  try {
    sessionStorage.removeItem(GATE_CACHE_KEY);
  } catch { /* ignore */ }
}

type GateState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

/**
 * After RoleGuard, redirects provider users still in onboarding (portal
 * `provider_onboarding` — draft / suspended) to /provider/get-started.
 * §provider-launch (2026-06): `pending_approval` now resolves to the `provider`
 * portal, so those providers are allowed on /provider/dashboard (which shows an
 * "under review" banner) instead of being bounced to get-started.
 *
 * The /api/me/portal result is cached in sessionStorage for 30 minutes so that
 * navigating between provider pages does not show a "Loading…" spinner on every route change.
 *
 * §Provider-launch (audit 2026-04): previously the portal check would
 * "fail open" on any /api/me/portal error — a transient network blip or
 * a 403 (non-provider trying to deep-link) would silently render the
 * provider shell. This version fails closed with an explicit error
 * screen and a guarded retry button (max 2 attempts, plus a manual
 * "Try again" that re-enters loading).
 */
export function ProviderPortalGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useAuth();

  const allowedPaths = ["/provider/get-started", "/provider/onboarding", "/provider/embed"];
  const isAllowedPath = allowedPaths.some((p) => pathname === p || pathname?.startsWith(p + "/"));

  // SSR and the first client render must match. Do not read sessionStorage in useState — on the
  // server it is always "no cache" while the client can have a warm cache, which caused React #418.
  const [state, setState] = useState<GateState>(isAllowedPath ? { kind: "ready" } : { kind: "loading" });
  const [retryKey, setRetryKey] = useState(0);

  useLayoutEffect(() => {
    if (isAllowedPath) {
      setState({ kind: "ready" });
      return;
    }

    if (readGateCache()) {
      setState({ kind: "ready" });
      return;
    }

    let cancelled = false;
    let attempt = 0;

    const run = async () => {
      attempt += 1;
      try {
        const res = await fetcher.get<{ data: { portal?: string } }>("/api/me/portal", {
          timeoutMs: 12_000,
        });
        if (cancelled) return;
        const portal = res.data?.portal;
        if (portal === "provider_onboarding") {
          const canAccessSetupRoute = pathname
            ? isProviderOnboardingRouteAllowed(pathname)
            : false;

          if (!canAccessSetupRoute) {
            router.replace("/provider/get-started");
          } else {
            setState({ kind: "ready" });
          }
          return;
        }

        // Customer-role users entering from provider login should continue to
        // onboarding rather than bouncing to the home page.
        if (portal === "customer") {
          clearGateCache();
          router.replace("/provider/onboarding");
          return;
        }

        // Hard deny: the server says this user shouldn't be in the provider portal.
        if (portal === "admin" || portal === "suspended") {
          clearGateCache();
          if (portal === "suspended") {
            router.replace("/account-suspended");
          } else {
            router.replace("/");
          }
          return;
        }

        writeGateCache();
        setState({ kind: "ready" });
      } catch (error) {
        if (cancelled) return;

        // 401/403 can be transient right after OTP/OAuth handoff; retry before forcing redirect.
        if (error instanceof FetchError && (error.status === 401 || error.status === 403)) {
          if (attempt < AUTH_RETRY_ATTEMPTS) {
            setTimeout(() => {
              if (!cancelled) run();
            }, 350 * attempt);
            return;
          }
          clearGateCache();
          router.replace(error.status === 401 ? "/auth" : "/");
          return;
        }

        // Otherwise retry with linear backoff for transient network/server failures.
        if (attempt < TRANSIENT_RETRY_ATTEMPTS) {
          setTimeout(() => {
            if (!cancelled) run();
          }, 1500 * attempt);
          return;
        }

        const message = error instanceof Error ? error.message : "Unable to verify your account.";
        setState({ kind: "error", message });
      }
    };

    setState({ kind: "loading" });
    run();

    return () => { cancelled = true; };
  // §Provider-launch (2026-05): re-run on `pathname` so a user who entered on
  // an allowed onboarding path (e.g. /provider/onboarding) does not silently
  // gain access to gated routes (e.g. /provider/bookings) on the next nav.
  // The sessionStorage cache prevents redundant /api/me/portal calls for
  // already-verified active providers.
  }, [router, retryKey, pathname, isAllowedPath]);

  if (state.kind === "loading") {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading…</div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Couldn't verify your account
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            We couldn't reach the server to confirm your provider access. This usually means a
            network issue. Please try again — we won't unlock the portal until verification
            succeeds.
          </p>
          {state.message ? (
            <p className="text-xs text-gray-500 mb-6">Details: {state.message}</p>
          ) : null}
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setRetryKey((k) => k + 1)}
              className="px-4 py-2 rounded-md bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={async () => {
                clearGateCache();
                try {
                  await signOut();
                } catch {
                  /* fall through to redirect */
                }
                router.replace("/auth");
              }}
              className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
