/**
 * Calls GET /api/me/account-status when the user has a session.
 * If deactivated or (for providers) suspended, signs out and redirects to login with query params for messaging.
 */
import { useEffect, useState, useRef } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";

type AccountStatus = {
  is_deactivated?: boolean;
  is_suspended?: boolean;
  deactivated_at?: string;
  deactivated_by?: string | null;
  suspension_reason?: string;
};

export function AccountStatusGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const userId = session?.user?.id ?? null;
  const [checked, setChecked] = useState(false);
  const didCheck = useRef(false);

  useEffect(() => {
    if (!userId) {
      didCheck.current = false;
      setChecked(true);
      return;
    }
    if (didCheck.current) {
      setChecked(true);
      return;
    }

    let cancelled = false;
    didCheck.current = true;

    (async () => {
      try {
        const res = (await api.get<AccountStatus>("/api/me/account-status")) as {
          data?: AccountStatus;
          error?: { message?: string };
        };
        if (cancelled) return;
        const status = res.data;
        if (res.error || !status) {
          setChecked(true);
          return;
        }
        if (status.is_suspended) {
          await signOut();
          if (!cancelled) router.replace("/(auth)/login?suspended=1" as never);
          return;
        }
        if (status.is_deactivated) {
          if (status.deactivated_by === "user") {
            try {
              const reactivateRes = (await api.post<{ data?: { reactivated?: boolean } }>(
                "/api/me/reactivate-account",
                {}
              )) as { data?: { reactivated?: boolean }; error?: unknown };
              if (reactivateRes?.data?.reactivated && !cancelled) {
                const recheck = (await api.get<AccountStatus>("/api/me/account-status")) as {
                  data?: AccountStatus;
                  error?: unknown;
                };
                if (!recheck?.data?.is_deactivated) {
                  setChecked(true);
                  return;
                }
              }
            } catch {
              // Fall through to sign out
            }
          }
          await signOut();
          if (!cancelled) router.replace("/(auth)/login?deactivated=1" as never);
          return;
        }
      } catch {
        // On network error, allow through; next API call may fail with 401
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, signOut, router]);

  if (!session) return <>{children}</>;
  if (!checked) return null;
  return <>{children}</>;
}
