"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { autoVerifyDevice, getSessionSecurityStatus } from "@beautonomi/auth-security";
import { useAuth } from "@/providers/AuthProvider";
import { webSecurityApi } from "@/lib/auth/security-api";
import { ensureWebDeviceKey } from "@/components/auth/security/SessionVerifyPanel";

const BYPASS_PREFIXES = [
  "/provider/verify",
  "/provider/signup",
  "/provider/join",
  "/provider/eula",
  "/provider/embed",
  "/provider/onboarding",
  "/provider/get-started",
  "/provider/subscription",
  "/provider/subscription-checkout",
];

const RECHECK_MS = 5 * 60 * 1000;

function shouldBypass(pathname: string | null): boolean {
  if (!pathname) return false;
  return BYPASS_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Sends provider sessions that still need an authenticator code or new-device check to
 * /provider/verify. Checks once per signed-in user and again when the tab regains focus.
 */
export function ProviderSecurityGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const pathRef = useRef(pathname);
  const lastCheckRef = useRef<{ userId: string; at: number } | null>(null);
  const runningRef = useRef(false);

  const checkRef = useRef<(force: boolean) => Promise<void>>(async () => undefined);

  useEffect(() => {
    pathRef.current = pathname;
    void checkRef.current(false);
  }, [pathname]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const check = async (force: boolean) => {
      if (runningRef.current || shouldBypass(pathRef.current)) return;
      const last = lastCheckRef.current;
      if (!force && last && last.userId === userId && Date.now() - last.at < RECHECK_MS) return;
      runningRef.current = true;
      try {
        await ensureWebDeviceKey().catch(() => undefined);
        let res = await getSessionSecurityStatus(webSecurityApi);
        if (res.data?.status === "device_required") {
          const auto = await autoVerifyDevice(webSecurityApi);
          if (auto.data?.status === "trusted") res = await getSessionSecurityStatus(webSecurityApi);
        }
        if (cancelled) return;
        if (!res.data) return;
        lastCheckRef.current = { userId, at: Date.now() };
        if (res.data.status !== "ok" && !shouldBypass(pathRef.current)) {
          const next = pathRef.current ?? "/provider/dashboard";
          router.replace(`/provider/verify?next=${encodeURIComponent(next)}`);
        }
      } finally {
        runningRef.current = false;
      }
    };

    checkRef.current = check;
    void check(lastCheckRef.current?.userId !== userId);
    const onFocus = () => void check(false);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      checkRef.current = async () => undefined;
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, router]);

  return <>{children}</>;
}
