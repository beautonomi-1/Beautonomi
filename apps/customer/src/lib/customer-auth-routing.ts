import { router } from "expo-router";
import type { Href } from "expo-router";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
import { resolvePostLoginHref } from "@/lib/post-login-href";
import { stashPostOnboardingHref } from "@/lib/post-onboarding-redirect";
import { authFlowBreadcrumb, isSentryEnabled, withAuthNavigationSpan } from "@/lib/sentry";

/**
 * After phone / email OTP / OAuth sign-in:
 * - Ensure session is persisted (iOS/Android) before navigation / API.
 * - Incomplete onboarding → root `/` so `app/index.tsx` runs portal + onboarding + profile checks (single pipeline).
 * - Completed → deep link via `return_to` or home.
 */
export async function navigateAfterCustomerAuth(returnTo: string | string[] | undefined): Promise<void> {
  return withAuthNavigationSpan("navigate_after_customer_auth", async () => {
    await supabase.auth.getSession();

    let completed = false;
    try {
      const res = await api.get<{ completed?: boolean }>("/api/me/onboarding/complete");
      completed = !res.error && res.data?.completed === true;
      if (isSentryEnabled()) {
        authFlowBreadcrumb("onboarding_complete_fetch", {
          completed,
          hasError: !!res.error,
        });
      }
    } catch (e) {
      completed = false;
      if (isSentryEnabled()) {
        authFlowBreadcrumb("onboarding_complete_fetch", {
          completed: false,
          hasError: true,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (!completed) {
      await stashPostOnboardingHref(returnTo);
      if (isSentryEnabled()) {
        authFlowBreadcrumb("router_replace", { to: "root_index" });
      }
      router.replace("/" as Href);
      return;
    }
    const href = resolvePostLoginHref(returnTo);
    if (isSentryEnabled()) {
      authFlowBreadcrumb("router_replace", {
        to: "app",
        href:
          typeof href === "object" ? JSON.stringify(href) : String(href),
      });
    }
    router.replace(href);
  });
}

/** Fresh email/password signups: stash deep link, then root index routes to onboarding. */
export async function navigateAfterNewCustomerSignup(returnTo: string | string[] | undefined): Promise<void> {
  return withAuthNavigationSpan("navigate_after_new_customer_signup", async () => {
    await supabase.auth.getSession();
    await stashPostOnboardingHref(returnTo);
    if (isSentryEnabled()) {
      authFlowBreadcrumb("router_replace", { to: "root_index", reason: "new_signup" });
    }
    router.replace("/" as Href);
  });
}
