import { router } from "expo-router";
import type { Href } from "expo-router";
import { api } from "@/lib/api-client";
import { resolvePostLoginHref } from "@/lib/post-login-href";
import { stashPostOnboardingHref } from "@/lib/post-onboarding-redirect";

/**
 * After phone / email OTP / OAuth sign-in: send incomplete customers to onboarding,
 * otherwise honor `return_to`. Preserves `return_to` through onboarding via stash.
 */
export async function navigateAfterCustomerAuth(returnTo: string | string[] | undefined): Promise<void> {
  let completed = false;
  try {
    const res = await api.get<{ completed?: boolean }>("/api/me/onboarding/complete");
    completed = res?.data?.completed === true;
  } catch {
    completed = false;
  }
  if (!completed) {
    await stashPostOnboardingHref(returnTo);
    router.replace("/(app)/onboarding" as Href);
    return;
  }
  router.replace(resolvePostLoginHref(returnTo));
}

/** Fresh email/password signups always enter onboarding; preserve return destination. */
export async function navigateAfterNewCustomerSignup(returnTo: string | string[] | undefined): Promise<void> {
  await stashPostOnboardingHref(returnTo);
  router.replace("/(app)/onboarding" as Href);
}
