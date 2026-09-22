import type { TemplateDispatchChannel } from "@/lib/notifications/channel-types";
import { isCustomerWhatsAppJourneyEnabled } from "@/lib/whatsapp/journey-flags";

/**
 * Default customer booking notification channels (no parallel SMS — waterfall only).
 */
export async function customerBookingChannels(
  tenantId?: string | null,
): Promise<TemplateDispatchChannel[]> {
  const base: TemplateDispatchChannel[] = ["push", "email"];
  if (await isCustomerWhatsAppJourneyEnabled(tenantId)) {
    base.push("whatsapp");
  }
  return base;
}

/** Avoid double WhatsApp tickets when guest_booking_link carries the WA ticket. */
export async function customerConfirmChannelsForGuestDedupe(
  supabaseAdmin: import("@supabase/supabase-js").SupabaseClient,
  customerId: string,
  tenantId?: string | null,
): Promise<TemplateDispatchChannel[]> {
  const channels = await customerBookingChannels(tenantId);
  const { shouldDeliverGuestLinkForCustomer } = await import(
    "@/lib/portal/guest-booking-link-delivery"
  );
  if (await shouldDeliverGuestLinkForCustomer(supabaseAdmin, customerId)) {
    return channels.filter((c) => c !== "whatsapp");
  }
  return channels;
}

export async function providerBookingChannels(
  tenantId?: string | null,
): Promise<TemplateDispatchChannel[]> {
  const base: TemplateDispatchChannel[] = ["push"];
  const { isProviderWhatsAppJourneyEnabled } = await import("@/lib/whatsapp/journey-flags");
  if (await isProviderWhatsAppJourneyEnabled(tenantId)) {
    base.push("whatsapp");
  }
  return base;
}
