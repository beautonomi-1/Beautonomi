import { trackServer } from "@/lib/analytics/amplitude/server";

export type ProviderCheckoutFunnelEvent =
  | "provider_checkout_plan_selected"
  | "provider_checkout_started"
  | "provider_checkout_completed"
  | "provider_checkout_abandoned";

export function trackProviderCheckoutFunnel(
  event: ProviderCheckoutFunnelEvent,
  properties: Record<string, unknown>,
  userId?: string | null,
): void {
  void trackServer(event, properties, userId ?? undefined).catch(() => {
    /* non-fatal */
  });
}
