/**
 * Checkout / confirmation copy for unconfirmed customer requests.
 * Uses the same expireAt as the cron (working-hours SLA + pre-slot).
 */
import { pendingConfirmationSlaDisplay as pendingConfirmationSlaDisplayCore } from "@beautonomi/utils";
import { readLifecycleDefaultsFromEnv } from "@/lib/bookings/lifecycle-deadlines";

export type { WorkingHoursJson, LifecycleProviderSettings } from "@beautonomi/utils";
export { slaSettingsFromHours } from "@beautonomi/utils";

export function pendingConfirmationSlaDisplay(
  input: Parameters<typeof pendingConfirmationSlaDisplayCore>[0],
): ReturnType<typeof pendingConfirmationSlaDisplayCore> {
  return pendingConfirmationSlaDisplayCore({
    ...input,
    defaults: readLifecycleDefaultsFromEnv(),
  });
}
