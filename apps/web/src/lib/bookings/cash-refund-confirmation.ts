import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTemplateNotification } from "@/lib/notifications/onesignal";

const CONFIRMATION_WINDOW_HOURS = 48;

export async function finalizeCashRefund(
  supabaseAdmin: SupabaseClient,
  refundId: string,
  bookingId: string,
  userId?: string | null,
): Promise<{ error?: string }> {
  const { error } = await supabaseAdmin
    .from("booking_refunds")
    .update({
      status: "completed",
      customer_confirmed_at: new Date().toISOString(),
    })
    .eq("id", refundId);

  if (error) return { error: error.message };

  try {
    await supabaseAdmin.from("booking_events").insert({
      booking_id: bookingId,
      event_type: "refund_confirmed",
      event_data: { refund_id: refundId },
      created_by: userId ?? null,
    });
  } catch {
    /* non-blocking */
  }

  return {};
}

export async function notifyCustomerCashRefundConfirmation(params: {
  customerId: string;
  bookingId: string;
  bookingNumber: string;
  refundId: string;
  amountFormatted: string;
  providerName: string;
  tenantId?: string | null;
}): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://beautonomi.com";
  const confirmUrl = `${baseUrl}/account-settings/bookings/${params.bookingId}?refund_confirm=${params.refundId}`;
  const disputeUrl = `${baseUrl}/account-settings/bookings/${params.bookingId}?refund_dispute=${params.refundId}`;

  await sendTemplateNotification(
    "cash_refund_confirmation",
    [params.customerId],
    {
      amount: params.amountFormatted,
      booking_number: params.bookingNumber,
      booking_id: params.bookingId,
      refund_id: params.refundId,
      provider_name: params.providerName,
      confirm_url: confirmUrl,
      dispute_url: disputeUrl,
    },
    ["push", "email", "sms"],
    { appType: "customer", tenantId: params.tenantId ?? null },
  );
}

export function cashRefundConfirmationDeadline(): string {
  return new Date(Date.now() + CONFIRMATION_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
}

export async function autoFinalizeExpiredCashRefunds(supabaseAdmin: SupabaseClient): Promise<number> {
  const now = new Date().toISOString();
  const { data: pending } = await supabaseAdmin
    .from("booking_refunds")
    .select("id, booking_id")
    .eq("status", "pending")
    .eq("customer_confirmation_required", true)
    .lte("confirmation_deadline_at", now);

  let count = 0;
  for (const row of pending ?? []) {
    const result = await finalizeCashRefund(
      supabaseAdmin,
      (row as { id: string }).id,
      (row as { booking_id: string }).booking_id,
    );
    if (!result.error) count += 1;
  }
  return count;
}
