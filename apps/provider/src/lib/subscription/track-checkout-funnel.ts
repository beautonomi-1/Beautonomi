import { api } from "@/lib/api-client";

export type ProviderCheckoutFunnelEvent =
  | "provider_checkout_plan_selected"
  | "provider_checkout_started"
  | "provider_checkout_completed"
  | "provider_checkout_abandoned";

export function trackProviderCheckoutFunnelClient(
  event: ProviderCheckoutFunnelEvent,
  properties: Record<string, unknown> = {},
): void {
  void api
    .post("/api/provider/subscription/funnel-event", { event, properties })
    .catch(() => {
      /* non-fatal */
    });
}
