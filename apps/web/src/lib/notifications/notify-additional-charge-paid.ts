import type { SupabaseClient } from "@supabase/supabase-js";
import { insertNotification } from "@/lib/notifications/insert-notification";
import { sendToUser } from "@/lib/notifications/onesignal";

type AdditionalChargePaidRow = {
  id: string;
  booking_id: string;
  amount: number | string;
  description?: string | null;
  paid_notified_at?: string | null;
  bookings?: {
    booking_number?: string | null;
    ref_number?: string | null;
    currency?: string | null;
    customer_id?: string | null;
    provider_id?: string | null;
  } | null;
};

/**
 * Send customer + provider notifications once when an additional charge is paid.
 * Uses paid_notified_at as an atomic gate.
 */
export async function notifyAdditionalChargePaid(
  supabase: SupabaseClient,
  chargeId: string,
): Promise<boolean> {
  const { data: winner, error: gateError } = await supabase
    .from("additional_charges")
    .update({ paid_notified_at: new Date().toISOString() })
    .eq("id", chargeId)
    .is("paid_notified_at", null)
    .select(
      "id, booking_id, amount, description, bookings(booking_number, ref_number, currency, customer_id, provider_id)",
    )
    .maybeSingle();

  if (gateError || !winner) {
    return false;
  }

  const row = winner as AdditionalChargePaidRow;
  const booking = row.bookings;
  const customerId = booking?.customer_id;
  const providerId = booking?.provider_id;
  const bookingRef =
    booking?.booking_number ?? booking?.ref_number ?? row.booking_id.slice(0, 8).toUpperCase();
  const currency = booking?.currency ?? "ZAR";
  const amountMajor = Number(row.amount ?? 0);

  if (customerId) {
    await insertNotification({
      user_id: customerId,
      type: "additional_charge_paid",
      title: "Additional Payment Confirmed",
      message: `Your additional payment of ${currency} ${amountMajor.toFixed(2)} for booking #${bookingRef} was successful.`,
      data: { booking_id: row.booking_id, charge_id: chargeId, amount: amountMajor },
      action_url: `/account-settings/bookings/${row.booking_id}`,
    });
    await sendToUser(
      customerId,
      {
        title: "Additional Payment Confirmed",
        message: `Your additional payment of ${currency} ${amountMajor.toFixed(2)} for booking #${bookingRef} was successful.`,
        data: { type: "additional_charge_paid", booking_id: row.booking_id, charge_id: chargeId },
        url: `/account-settings/bookings/${row.booking_id}`,
      },
      ["push"],
      { appType: "customer" },
    ).catch(() => undefined);
  }

  if (providerId) {
    const { data: providerRow } = await supabase
      .from("providers")
      .select("user_id")
      .eq("id", providerId)
      .maybeSingle();
    const providerUserId = (providerRow as { user_id?: string } | null)?.user_id;
    if (providerUserId) {
      await insertNotification({
        user_id: providerUserId,
        type: "additional_charge_paid",
        title: "Additional Payment Received",
        message: `Additional payment of ${currency} ${amountMajor.toFixed(2)} received for booking #${bookingRef}.`,
        data: { booking_id: row.booking_id, charge_id: chargeId, amount: amountMajor },
        action_url: `/provider/bookings/${row.booking_id}`,
      });
      await sendToUser(
        providerUserId,
        {
          title: "Additional Payment Received",
          message: `Additional payment of ${currency} ${amountMajor.toFixed(2)} received for booking #${bookingRef}.`,
          data: { type: "additional_charge_paid", booking_id: row.booking_id, charge_id: chargeId },
          url: `/provider/bookings/${row.booking_id}`,
        },
        ["push"],
        { appType: "provider" },
      ).catch(() => undefined);
    }
  }

  return true;
}
