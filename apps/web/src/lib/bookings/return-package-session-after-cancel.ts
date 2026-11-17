import type { SupabaseClient } from "@supabase/supabase-js";
import { hasPendingRescheduleReplacement } from "@/lib/bookings/reschedule-carry-over";

/**
 * A cancelled visit gives its prepaid session back once.
 * A visit that is being rescheduled keeps the session on the replacement.
 */
export async function returnPackageSessionAfterCancel(
  admin: SupabaseClient,
  bookingId: string,
): Promise<void> {
  let entitlementId = "";
  let claimed = false;
  try {
    if (await hasPendingRescheduleReplacement(admin, bookingId)) return;
    const { data } = await admin
      .from("bookings")
      .select("customer_id, customer_package_entitlement_id, rescheduled_from_booking_id")
      .eq("id", bookingId)
      .maybeSingle();
    const row = data as {
      customer_id?: string | null;
      customer_package_entitlement_id?: string | null;
      rescheduled_from_booking_id?: string | null;
    } | null;
    entitlementId = row?.customer_package_entitlement_id ? String(row.customer_package_entitlement_id) : "";
    const customerId = row?.customer_id ? String(row.customer_id) : "";
    if (!entitlementId || !customerId) return;

    const replacedBookingId = row?.rescheduled_from_booking_id
      ? String(row.rescheduled_from_booking_id)
      : "";
    if (replacedBookingId) {
      const { data: original } = await admin
        .from("bookings")
        .select("customer_package_entitlement_id")
        .eq("id", replacedBookingId)
        .maybeSingle();
      const originalEntitlement = (original as { customer_package_entitlement_id?: string | null } | null)
        ?.customer_package_entitlement_id;
      if (originalEntitlement && String(originalEntitlement) === entitlementId) {
        await admin
          .from("bookings")
          .update({ customer_package_entitlement_id: null })
          .eq("id", bookingId)
          .eq("customer_package_entitlement_id", entitlementId);
        return;
      }
    }

    const { data: cleared } = await admin
      .from("bookings")
      .update({ customer_package_entitlement_id: null })
      .eq("id", bookingId)
      .eq("customer_package_entitlement_id", entitlementId)
      .select("id");
    if (!cleared?.length) return;
    claimed = true;

    const { data: restored, error } = await admin.rpc("restore_customer_package_entitlement", {
      p_entitlement_id: entitlementId,
      p_customer_id: customerId,
    });
    if (error || restored !== true) throw error ?? new Error("package session was not returned");
  } catch (err) {
    console.error("[cancel] package session was not returned", bookingId, err);
    if (claimed && entitlementId) {
      await admin
        .from("bookings")
        .update({ customer_package_entitlement_id: entitlementId })
        .eq("id", bookingId)
        .is("customer_package_entitlement_id", null);
    }
  }
}
