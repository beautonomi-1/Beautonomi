import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { autoVerifyDevice, getSessionSecurityStatus } from "@beautonomi/auth-security";
import { useAuth } from "@/providers/AuthProvider";
import { providerSecurityApi } from "@/lib/security/security-api";
import { ensureDeviceKeyRegistered } from "@/lib/security/ensure-device-key";

const VERIFY_PATH = "/(app)/security-verify";
const RECHECK_MS = 5 * 60 * 1000;

function isExempt(pathname: string | null): boolean {
  return !!pathname && (pathname.includes("security-verify") || pathname.includes("settings-two-step"));
}

/**
 * Sends sessions that still need an authenticator code or new-device check to the verify
 * screen. Checks once per signed-in user and again when the app returns to the foreground.
 */
export function SessionSecurityGate({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const lastCheckRef = useRef<{ userId: string; at: number } | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!userId) {
      lastCheckRef.current = null;
      return;
    }
    let cancelled = false;

    const check = async (force: boolean) => {
      if (runningRef.current || isExempt(pathRef.current)) return;
      const last = lastCheckRef.current;
      if (!force && last && last.userId === userId && Date.now() - last.at < RECHECK_MS) return;
      runningRef.current = true;
      try {
        await ensureDeviceKeyRegistered().catch(() => null);
        let res = await getSessionSecurityStatus(providerSecurityApi);
        if (res.data?.status === "device_required") {
          const auto = await autoVerifyDevice(providerSecurityApi);
          if (auto.data?.status === "trusted") res = await getSessionSecurityStatus(providerSecurityApi);
        }
        if (cancelled || !res.data) return;
        lastCheckRef.current = { userId, at: Date.now() };
        if (res.data.status !== "ok" && !isExempt(pathRef.current)) {
          router.push(VERIFY_PATH as never);
        }
      } finally {
        runningRef.current = false;
      }
    };

    void check(lastCheckRef.current?.userId !== userId);
    const sub =
      typeof (AppState as unknown as { addEventListener?: unknown }).addEventListener === "function"
        ? AppState.addEventListener("change", (s) => {
            if (s === "active") void check(false);
          })
        : undefined;
    return () => {
      cancelled = true;
      try {
        (sub as unknown as { remove?: () => void } | undefined)?.remove?.();
      } catch {
        // ignore
      }
    };
  }, [userId, router]);

  return <>{children}</>;
}
