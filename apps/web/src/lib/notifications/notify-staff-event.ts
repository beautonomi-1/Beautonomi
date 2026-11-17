import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { insertNotification } from "@/lib/notifications/insert-notification";

export type StaffNotificationEvent =
  | "staff_booking_assigned"
  | "staff_booking_reassigned"
  | "staff_booking_cancelled"
  | "staff_schedule_changed"
  | "staff_time_off_requested"
  | "staff_time_off_approved"
  | "staff_time_off_denied"
  | "staff_tip_received"
  | "staff_pay_run_approved"
  | "staff_pay_run_paid";

const EVENT_TO_TYPE: Record<StaffNotificationEvent, string> = {
  staff_booking_assigned: "staff_assignment",
  staff_booking_reassigned: "booking_staff_changed",
  staff_booking_cancelled: "booking_cancelled",
  staff_schedule_changed: "booking_update",
  staff_time_off_requested: "system",
  staff_time_off_approved: "system",
  staff_time_off_denied: "system",
  staff_tip_received: "payment_received",
  staff_pay_run_approved: "system",
  staff_pay_run_paid: "payout_processed",
};

/**
 * Notify a single staff user (not team-wide fan-out).
 */
export async function notifyStaffUser(
  staffId: string,
  event: StaffNotificationEvent,
  payload: {
    title: string;
    message: string;
    url?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data: staff } = await admin
    .from("provider_staff")
    .select("user_id, provider_id")
    .eq("id", staffId)
    .maybeSingle();

  const userId = (staff as { user_id?: string | null } | null)?.user_id;
  if (!userId) return;

  await insertNotification({
    user_id: userId,
    type: EVENT_TO_TYPE[event],
    title: payload.title,
    message: payload.message,
    action_url: payload.url,
    metadata: {
      staff_event: event,
      staff_id: staffId,
      provider_id: (staff as { provider_id?: string | null }).provider_id ?? null,
      ...(payload.metadata ?? {}),
    },
  });
}

/** Personal pay alert. Push follows the provider "Payout updates" preference (on unless turned off). */
async function pushProviderPayAlert(
  userId: string,
  title: string,
  message: string,
  actionUrl: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const { sendToUsers } = await import("@/lib/notifications/onesignal");
    await sendToUsers(
      [userId],
      {
        title,
        message,
        type: "payout_processed",
        url: actionUrl,
        data: {
          ...metadata,
          type: "payout_processed",
          action_url: actionUrl,
        },
      },
      ["push"],
      { appType: "provider" },
    );
  } catch (err) {
    console.warn("[notifyPayRunStaff] push failed:", err);
  }
}

function formatMoney(amount: number, currency?: string | null): string {
  const n = Number(amount ?? 0);
  const code = (currency ?? "ZAR").trim().toUpperCase();
  const prefix = code === "ZAR" || code === "R" ? "R" : code;
  return `${prefix} ${n.toFixed(2)}`;
}

/**
 * Pay run approved / paid: notify every staff member with an item on the run.
 * Called from POST /api/provider/pay-runs/[id]/approve and /mark-paid.
 */
export async function notifyPayRunStaff(
  admin: SupabaseClient,
  payRunId: string,
  event: "staff_pay_run_approved" | "staff_pay_run_paid",
  ctx: { periodStart: string; periodEnd: string; paymentReference?: string | null; currency?: string | null },
): Promise<number> {
  const { data: items } = await admin
    .from("provider_pay_run_items")
    .select("staff_id, net_pay")
    .eq("pay_run_id", payRunId);

  const { data: run } = await admin
    .from("provider_pay_runs")
    .select("provider_id")
    .eq("id", payRunId)
    .maybeSingle();
  const providerId = (run as { provider_id?: string | null } | null)?.provider_id ?? null;

  let sent = 0;
  const period = `${ctx.periodStart} – ${ctx.periodEnd}`;
  const referenceSuffix = ctx.paymentReference ? ` (ref ${ctx.paymentReference})` : "";
  for (const item of (items ?? []) as Array<{ staff_id: string; net_pay: number | null }>) {
    if (!item.staff_id) continue;
    const { data: staff } = await admin
      .from("provider_staff")
      .select("user_id")
      .eq("id", item.staff_id)
      .maybeSingle();
    const userId = (staff as { user_id?: string | null } | null)?.user_id;
    if (!userId) continue;
    const net = formatMoney(Number(item.net_pay ?? 0), ctx.currency);
    const title = event === "staff_pay_run_paid" ? "You have been paid" : "Pay run approved";
    const message =
      event === "staff_pay_run_paid"
        ? `Your pay for ${period} (${net}) was marked as paid${referenceSuffix}.`
        : `Your pay for ${period} (${net}) has been approved.`;
    const metadata = {
      pay_run_id: payRunId,
      period_start: ctx.periodStart,
      period_end: ctx.periodEnd,
      net_pay: Number(item.net_pay ?? 0),
      payment_reference: ctx.paymentReference ?? null,
    };
    await notifyStaffUser(item.staff_id, event, {
      title,
      message,
      url: "/provider/team/my-earnings",
      metadata,
    }).catch(() => undefined);
    await pushProviderPayAlert(userId, title, message, "/provider/team/my-earnings", metadata);
    sent++;
  }

  if (providerId) {
    const { data: owner } = await admin
      .from("providers")
      .select("user_id")
      .eq("id", providerId)
      .maybeSingle();
    const ownerId = (owner as { user_id?: string | null } | null)?.user_id;
    if (ownerId) {
      const title = event === "staff_pay_run_paid" ? "Pay run marked paid" : "Pay run approved";
      const message =
        event === "staff_pay_run_paid"
          ? `Pay for ${period} was marked as paid. Each person on the run has been notified${referenceSuffix}.`
          : `Pay for ${period} was approved. Each person on the run has been notified.`;
      const metadata = {
        pay_run_id: payRunId,
        period_start: ctx.periodStart,
        period_end: ctx.periodEnd,
        payroll_summary: true,
      };
      await insertNotification({
        user_id: ownerId,
        type: EVENT_TO_TYPE[event],
        title,
        message,
        action_url: "/provider/team/payroll",
        metadata: {
          staff_event: event,
          provider_id: providerId,
          ...metadata,
        },
      });
      await pushProviderPayAlert(ownerId, title, message, "/provider/team/payroll", metadata);
      sent++;
    }
  }
  return sent;
}

/**
 * Tip received: notify each staff member with a positive `tip`
 * staff_earnings_lines row for the given tip finance_transactions id.
 *
 * Call site (owned by the ledger writers): after the tip `finance_transactions`
 * row is inserted — `recordBookingOnlineChargeLedger` / additional-charge tip
 * settlement — pass the tip FT id. Idempotent per FT via the metadata dedupe
 * key on the notification row.
 */
export async function notifyStaffTipReceived(
  admin: SupabaseClient,
  tipFinanceTransactionId: string,
  ctx: { customerName?: string | null; bookingDate?: string | null; currency?: string | null } = {},
): Promise<number> {
  const { data: lines } = await admin
    .from("staff_earnings_lines")
    .select("staff_id, amount, booking_id")
    .eq("source_finance_transaction_id", tipFinanceTransactionId)
    .eq("kind", "tip")
    .gt("amount", 0);

  let sent = 0;
  for (const line of (lines ?? []) as Array<{ staff_id: string; amount: number; booking_id: string | null }>) {
    await notifyStaffUser(line.staff_id, "staff_tip_received", {
      title: "You received a tip",
      message: `A ${formatMoney(line.amount, ctx.currency)} tip was added${ctx.customerName ? ` for ${ctx.customerName}` : ""}${ctx.bookingDate ? ` (${ctx.bookingDate})` : ""}.`,
      url: "/provider/team/my-earnings",
      metadata: {
        booking_id: line.booking_id,
        amount: line.amount,
        source_finance_transaction_id: tipFinanceTransactionId,
        dedupe_key: `staff_tip:${tipFinanceTransactionId}:${line.staff_id}`,
      },
    }).catch(() => undefined);
    sent++;
  }
  return sent;
}

/**
 * Resolve tip finance_transactions for a booking and notify assigned staff.
 * Best-effort: never throws. Safe to call after any ledger writer that may
 * have posted a `tip` row (idempotent per FT + staff via metadata.dedupe_key).
 */
export async function notifyStaffTipReceivedForBooking(
  admin: SupabaseClient,
  bookingId: string,
  ctx: { customerName?: string | null; bookingDate?: string | null; currency?: string | null } = {},
): Promise<number> {
  try {
    const { data: tips } = await admin
      .from("finance_transactions")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("transaction_type", "tip");
    let sent = 0;
    for (const tip of (tips ?? []) as Array<{ id?: string }>) {
      if (!tip.id) continue;
      sent += await notifyStaffTipReceived(admin, tip.id, ctx);
    }
    return sent;
  } catch {
    return 0;
  }
}
