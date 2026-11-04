import type { SupabaseClient } from "@supabase/supabase-js";
import { insertNotification } from "@/lib/notifications/insert-notification";
import {
  dispatchTemplateNotification,
  withTenantVariable,
} from "@/lib/notifications/dispatch-template-notification";

/**
 * Notify the lead customer and provider when a non-primary guest leaves a group booking.
 */
export async function notifyGroupGuestCancelled(
  admin: SupabaseClient,
  input: {
    groupBookingId: string;
    guestName?: string | null;
    leadBookingId?: string | null;
  },
): Promise<void> {
  const groupBookingId = input.groupBookingId;
  let leadId = input.leadBookingId ?? null;
  if (!leadId) {
    const { data: group } = await admin
      .from("group_bookings")
      .select("primary_contact_booking_id")
      .eq("id", groupBookingId)
      .maybeSingle();
    leadId =
      ((group as { primary_contact_booking_id?: string | null } | null)?.primary_contact_booking_id ??
        null) as string | null;
  }
  if (!leadId) return;

  const { data: lead } = await admin
    .from("bookings")
    .select("customer_id, provider_id, booking_number, tenant_id")
    .eq("id", leadId)
    .maybeSingle();
  const row = lead as {
    customer_id?: string | null;
    provider_id?: string | null;
    booking_number?: string | null;
    tenant_id?: string | null;
  } | null;
  if (!row) return;

  const who = input.guestName?.trim() || "A guest";
  const ref = row.booking_number || leadId;
  const message = `${who} cancelled their spot in group booking ${ref}.`;
  const data = { booking_id: leadId, group_booking_id: groupBookingId, subtype: "group_guest_cancelled" };

  let providerName = "";
  if (row.provider_id) {
    const { data: provider } = await admin
      .from("providers")
      .select("business_name, user_id")
      .eq("id", row.provider_id)
      .maybeSingle();
    providerName = (provider as { business_name?: string | null } | null)?.business_name?.trim() || "";
    const providerUserId = (provider as { user_id?: string | null } | null)?.user_id;
    if (providerUserId) {
      await insertNotification({
        user_id: providerUserId,
        type: "group_guest_cancelled",
        title: "Guest cancelled",
        message,
        data,
        action_url: `/provider/bookings/${leadId}`,
      });
      try {
        await dispatchTemplateNotification(
          "group_guest_cancelled",
          [providerUserId],
          withTenantVariable(row.tenant_id, {
            guest_name: who,
            provider_name: providerName || "Beautonomi Partner",
            booking_id: leadId,
            group_booking_id: groupBookingId,
          }),
          ["push", "email"],
          { appType: "provider", tenantId: row.tenant_id ?? undefined },
        );
      } catch (err) {
        console.warn("[notifyGroupGuestCancelled] provider template failed:", err);
      }
    }
  }

  if (row.customer_id) {
    await insertNotification({
      user_id: row.customer_id,
      type: "group_guest_cancelled",
      title: "Guest cancelled",
      message,
      data,
      action_url: `/group-booking-detail?id=${groupBookingId}`,
    });
    try {
      await dispatchTemplateNotification(
        "group_guest_cancelled",
        [row.customer_id],
        withTenantVariable(row.tenant_id, {
          guest_name: who,
          provider_name: providerName || "Beautonomi Partner",
          booking_id: leadId,
          group_booking_id: groupBookingId,
        }),
        ["push", "email"],
        { appType: "customer", tenantId: row.tenant_id ?? undefined },
      );
    } catch (err) {
      console.warn("[notifyGroupGuestCancelled] lead template failed:", err);
    }
  }
}
