import { fetcher } from "@/lib/http/fetcher";

/**
 * First-time OTP/OAuth customers have NULL customer_onboarding_completed_at.
 * Consume refuses those bookings with ONBOARDING_REQUIRED. The widget cannot
 * open /onboarding (not frameable), so mark the wizard complete after gate
 * sign-in. The booking already collected name / email / phone as client_info.
 */
export async function completeCustomerOnboardingQuietly(): Promise<void> {
  try {
    await fetcher.post("/api/me/onboarding/complete");
  } catch {
    // Caller retries on ONBOARDING_REQUIRED; never block sign-in.
  }
}
