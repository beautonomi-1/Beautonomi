"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { fetcher } from "@/lib/http/fetcher";

const GATE_CACHE_KEY = "provider_gate_status";
const GATE_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

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

/**
 * After RoleGuard, redirects provider users whose status is not active
 * to /provider/get-started (setup status). Avoids showing dashboard to draft/pending_approval/suspended.
 *
 * The /api/me/portal result is cached in sessionStorage for 30 minutes so that
 * navigating between provider pages does not show a "Loading…" spinner on every route change.
 */
export function ProviderPortalGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Start ready if we already have a valid cached check for this session
  const [ready, setReady] = useState(() => readGateCache());

  useEffect(() => {
    const allowedPaths = ["/provider/get-started", "/provider/onboarding", "/provider/embed"];
    const isAllowedPath = allowedPaths.some((p) => pathname === p || pathname?.startsWith(p + "/"));
    if (isAllowedPath) {
      setReady(true);
      return;
    }

    // Cache hit — no network call needed
    if (readGateCache()) {
      setReady(true);
      return;
    }

    let cancelled = false;
    fetcher
      .get<{ data: { portal?: string } }>("/api/me/portal")
      .then((res) => {
        if (cancelled) return;
        const portal = res.data?.portal;
        if (portal === "provider_onboarding") {
          const onboardingAllowedPrefixes = [
            "/provider/get-started",
            "/provider/onboarding",
            "/provider/settings/appointment-activity/business-details",
            "/provider/settings/locations",
            "/provider/settings/gallery",
            "/provider/settings/operating-hours",
            "/provider/settings/sales/yoco-integration",
            "/provider/settings/sales/yoco-devices",
            "/provider/settings/payments",
            "/provider/settings/payout-accounts",
            "/provider/catalogue/services",
          ];
          const canAccessSetupRoute = onboardingAllowedPrefixes.some(
            (p) => pathname === p || pathname?.startsWith(`${p}/`)
          );

          if (!canAccessSetupRoute) {
            router.replace("/provider/get-started");
          } else {
            setReady(true);
          }
          return;
        }
        writeGateCache();
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true); // fail open so a network blip doesn't lock the portal
      });

    return () => { cancelled = true; };
  // pathname is intentionally excluded: once the gate passes, all sub-routes are allowed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading…</div>
      </div>
    );
  }
  return <>{children}</>;
}
