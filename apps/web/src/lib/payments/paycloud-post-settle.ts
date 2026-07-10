import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type PaycloudPaymentRow = {
  id: string;
  provider_id: string;
  processed_by?: string | null;
  currency: string;
  amount: number;
  entity_type: string;
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

  const bookingId = settleResult.bookingId;
  if (!bookingId || payment.entity_type !== "booking") return;
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

  const { data: booking } = await admin
    .from("bookings")
    .select("total_amount, payment_status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking || booking.payment_status !== "paid") return;

  try {
    const { notifyReceiptSent } = await import("@/lib/notifications/notification-service");
    await notifyReceiptSent(
      bookingId,
      Number(booking.total_amount ?? capturedAmount),
      new Date(),
      ["email"],
    );
    metadata.receipt_sent_at = new Date().toISOString();
    await supabase
      .from("provider_paycloud_payments")
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq("id", payment.id);
  } catch (receiptError) {
    console.error("PayCloud post-settle receipt failed:", receiptError);
  }
}
