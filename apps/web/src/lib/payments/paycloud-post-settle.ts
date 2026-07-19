import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type PaycloudPaymentRow = {
  id: string;
  provider_id: string;
  processed_by?: string | null;
  currency: string;
  amount: number;
  entity_type: string;
  entity_id: string;
  metadata?: Record<string, unknown> | null;
};

/**
 * After a successful PayCloud settle: staff push (idempotent) + optional customer receipt
 * for booking entities when provider has receipt_auto_send enabled.
 */
export async function handlePaycloudPostSettle(
  supabase: SupabaseClient,
  payment: PaycloudPaymentRow,
  settleResult: { settled: boolean; bookingId?: string },
  capturedAmount: number,
): Promise<void> {
  if (!settleResult.settled) return;

  const metadata =
    payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
      ? { ...payment.metadata }
      : {};

  const staffAlreadyNotified = metadata.staff_push_sent_at != null;
  if (!staffAlreadyNotified && payment.processed_by) {
    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      await sendToUser(
        String(payment.processed_by),
        {
          title: "Payment received",
          message: `Card payment of ${capturedAmount.toFixed(2)} ${payment.currency} completed.`,
          data: { type: "paycloud_payment", payment_id: payment.id, status: "successful" },
        },
        ["push"],
        { appType: "provider" },
      );
      metadata.staff_push_sent_at = new Date().toISOString();
      await supabase
        .from("provider_paycloud_payments")
        .update({ metadata, updated_at: new Date().toISOString() })
        .eq("id", payment.id);
    } catch (e) {
      console.error("PayCloud post-settle staff push failed:", e);
    }
  }

  // Customer receipts: bookings settle to one booking, additional charges settle
  // to their parent booking, group bookings settle across every child booking.
  const receiptEntityTypes = new Set(["booking", "additional_charge", "group_booking"]);
  if (!receiptEntityTypes.has(payment.entity_type)) return;
  if (metadata.receipt_sent_at != null) return;

  const admin = getSupabaseAdmin();
  const { data: providerRow } = await admin
    .from("providers")
    .select("receipt_auto_send")
    .eq("id", payment.provider_id)
    .maybeSingle();

  const receiptAutoSend =
    (providerRow as { receipt_auto_send?: boolean | null } | null)?.receipt_auto_send !== false;
  if (!receiptAutoSend) return;

  let receiptBookingIds: string[] = [];
  if (payment.entity_type === "group_booking") {
    const { data: children } = await admin
      .from("bookings")
      .select("id, payment_status")
      .eq("group_booking_id", payment.entity_id)
      .eq("provider_id", payment.provider_id)
      .not("status", "in", "(cancelled,no_show)");
    receiptBookingIds = (children ?? [])
      .filter((b) => b.payment_status === "paid")
      .map((b) => b.id);
  } else if (settleResult.bookingId) {
    receiptBookingIds = [settleResult.bookingId];
  }
  if (!receiptBookingIds.length) return;

  try {
    const { notifyReceiptSent } = await import("@/lib/notifications/notification-service");
    let sentAny = false;
    for (const bookingId of receiptBookingIds) {
      const { data: booking } = await admin
        .from("bookings")
        .select("total_amount, payment_status")
        .eq("id", bookingId)
        .maybeSingle();
      if (!booking || booking.payment_status !== "paid") continue;
      await notifyReceiptSent(
        bookingId,
        Number(booking.total_amount ?? capturedAmount),
        new Date(),
        ["email"],
      );
      sentAny = true;
    }
    if (sentAny) {
      metadata.receipt_sent_at = new Date().toISOString();
      await supabase
        .from("provider_paycloud_payments")
        .update({ metadata, updated_at: new Date().toISOString() })
        .eq("id", payment.id);
    }
  } catch (receiptError) {
    console.error("PayCloud post-settle receipt failed:", receiptError);
  }
}
