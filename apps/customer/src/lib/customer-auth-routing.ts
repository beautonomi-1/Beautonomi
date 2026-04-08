import { router } from "expo-router";
import type { Href } from "expo-router";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
import { resolvePostLoginHref } from "@/lib/post-login-href";
import { stashPostOnboardingHref } from "@/lib/post-onboarding-redirect";

/**
 * After phone / email OTP / OAuth sign-in:
 * - Ensure session is persisted (iOS/Android) before navigation / API.
 * - Incomplete onboarding → root `/` so `app/index.tsx` runs portal + onboarding + profile checks (single pipeline).
 * - Completed → deep link via `return_to` or home.
 */
export async function navigateAfterCustomerAuth(returnTo: string | string[] | undefined): Promise<void> {
  await supabase.auth.getSession();

  let completed = false;
  try {
    const res = await api.get<{ completed?: boolean }>("/api/me/onboarding/complete");
    completed = !res.error && res.data?.completed === true;
  } catch {
    completed = false;
  }

  if (!completed) {
    await stashPostOnboardingHref(returnTo);
    router.replace("/" as Href);
    return;
  }
  router.replace(resolvePostLoginHref(returnTo));
}

/** Fresh email/password signups: stash deep link, then root index routes to onboarding. */
export async function navigateAfterNewCustomerSignup(returnTo: string | string[] | undefined): Promise<void> {
  await supabase.auth.getSession();
  await stashPostOnboardingHref(returnTo);
  router.replace("/" as Href);
}
