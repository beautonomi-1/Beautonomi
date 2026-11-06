/**
 * Close out cancellations whose wallet refund failed during settlement.
 *
 * The refund itself is replayed by the auto wallet credit cron (or by finance
 * staff from the refunds queue) using the failed `booking_refunds` row and its
 * idempotency key. Re-running settlement here would need the original actor,
 * fee and refund rail, so this cron only stamps `cancellation_settled_at` once
 * the cancellation credit has completed, and alerts when it stays open.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { slackNotifyCancellationSettlementStuck } from "@/lib/integrations/slack/ops-triggers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALERT_AFTER_ATTEMPTS = 3;

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ ok: false, error: auth.error ?? "unauthorized" }, { status: 401 });
  }

  return runLockedCronRoute("settle-pending-cancellations", async () => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("bookings")
      .select("id, tenant_id, cancellation_settlement_attempts, cancellation_settlement_error")
      .in("status", ["cancelled", "no_show"])
      .is("cancellation_settled_at", null)
      .not("cancellation_settlement_error", "is", null)
      .limit(100);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let settled = 0;
    let open = 0;
    for (const row of data ?? []) {
      const { data: refunds, error: refundsErr } = await admin
        .from("booking_refunds")
        .select("status, reason")
        .eq("booking_id", row.id)
        .eq("refund_method", "store_credit");
      if (refundsErr) {
        open += 1;
        continue;
      }
      const rows = (refunds ?? []) as Array<{ status?: string | null; reason?: string | null }>;
      const hasOpenCredit = rows.some((r) => r.status === "failed" || r.status === "pending");
      const hasCompletedCancellationCredit = rows.some(
        (r) => r.status === "completed" && String(r.reason ?? "").startsWith("Cancellation refund"),
      );

      if (!hasOpenCredit && hasCompletedCancellationCredit) {
        await admin
          .from("bookings")
          .update({
            cancellation_settled_at: new Date().toISOString(),
            cancellation_settlement_error: null,
          })
          .eq("id", row.id);
        settled += 1;
        continue;
      }

      open += 1;
      const attempts = Number(row.cancellation_settlement_attempts ?? 0) + 1;
      await admin
        .from("bookings")
        .update({ cancellation_settlement_attempts: attempts })
        .eq("id", row.id);
      if (attempts === ALERT_AFTER_ATTEMPTS) {
        slackNotifyCancellationSettlementStuck({
          tenantId: row.tenant_id,
          bookingId: row.id,
          reason: String(row.cancellation_settlement_error ?? "refund_not_credited"),
        });
      }
    }

    // Reschedules whose replacement was paid but the carry-over did not finish
    // (for example the original's refund was still pending).
    const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: unfinalized } = await admin
      .from("bookings")
      .select("id, payment_status, payment_provider")
      .not("rescheduled_from_booking_id", "is", null)
      .is("reschedule_carry_over_finalized_at", null)
      .neq("status", "cancelled")
      .lt("created_at", staleBefore)
      .limit(50);
    let rescheduleFinalized = 0;
    const { finalizeRescheduleCarryOver } = await import("@/lib/bookings/reschedule-carry-over");
    for (const row of (unfinalized ?? []) as Array<{
      id: string;
      payment_status?: string | null;
      payment_provider?: string | null;
    }>) {
      const committed =
        row.payment_status === "paid" ||
        row.payment_status === "partially_paid" ||
        row.payment_provider === "cash";
      if (!committed) continue;
      const result = await finalizeRescheduleCarryOver(admin, row.id);
      if (result.ok) rescheduleFinalized += 1;
    }

    return NextResponse.json({ ok: true, settled, open, reschedule_finalized: rescheduleFinalized });
  });
}
