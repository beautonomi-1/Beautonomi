"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { fetcher } from "@/lib/http/fetcher";

/**
 * After RoleGuard, redirects provider users whose status is not active
 * to /provider/get-started (setup status). Avoids showing dashboard to draft/pending_approval/suspended.
 */
export function ProviderPortalGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const allowedPaths = ["/provider/get-started", "/provider/onboarding", "/provider/embed"];
    const isAllowedPath = allowedPaths.some((p) => pathname === p || pathname?.startsWith(p + "/"));
    if (isAllowedPath) {
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
          router.replace("/provider/get-started");
          return;
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!ready) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading…</div>
      </div>
    );
  }
  return <>{children}</>;
}
