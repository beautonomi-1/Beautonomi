"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "@beautonomi/i18n";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  buildAuthErrorLoginPath,
  parseImplicitAuthFragment,
  resolveImplicitAuthDestination,
} from "@/lib/auth/implicit-auth-fragment";

export default function AuthCallbackCompleteClient() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const next = searchParams.get("next");
    const fragment = parseImplicitAuthFragment(window.location.hash);

    // Full navigations so the proxy sees the freshly written session cookies.
    const go = (path: string) => window.location.replace(path);

    if (fragment.kind === "error") {
      go(buildAuthErrorLoginPath(fragment.message, next));
      return;
    }
    if (fragment.kind === "none") {
      go(buildAuthErrorLoginPath("missing_code", next));
      return;
    }

    (async () => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        go(buildAuthErrorLoginPath("missing_code", next));
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: fragment.accessToken,
        refresh_token: fragment.refreshToken,
      });
      if (error) {
        go(buildAuthErrorLoginPath(error.message, next));
        return;
      }
      go(resolveImplicitAuthDestination(fragment.type, next));
    })();
  }, [searchParams]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <p className="text-sm text-gray-500">{t("web.accountSettings.loading.loading")}</p>
    </div>
  );
}
