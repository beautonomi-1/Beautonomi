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
import {
  finishCancellationLoyalty,
  GIFT_CARD_STILL_HELD,
  GIFT_VALUE_STILL_DUE,
  giftValueStillDueAmount,
  bookingGiftVoidOutcome,
  LOYALTY_POINTS_STILL_DUE,
  settlementErrorAfterWalletCredit,
} from "@/lib/bookings/settle-booking-cancellation";
import { spentGiftReturnAmount, visitClosedForGiftReturn } from "@/lib/bookings/gift-value-still-due";

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
      .select("id, tenant_id, customer_id, booking_number, cancellation_settlement_attempts, cancellation_settlement_error")
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
      const loyalty = await finishCancellationLoyalty(admin, {
        id: row.id,
        customer_id: row.customer_id,
        booking_number: row.booking_number,
      });
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

      if (
        !hasOpenCredit &&
        hasCompletedCancellationCredit &&
        String(row.cancellation_settlement_error ?? "") !== GIFT_CARD_STILL_HELD
      ) {
        await admin
          .from("bookings")
          .update({
            cancellation_settled_at: new Date().toISOString(),
            cancellation_settlement_error: settlementErrorAfterWalletCredit(
              String(row.cancellation_settlement_error ?? ""),
              loyalty.stillDue,
            ),
          })
          .eq("id", row.id);
        settled += 1;
        continue;
      }

      if (
        (String(row.cancellation_settlement_error ?? "") === LOYALTY_POINTS_STILL_DUE ||
          String(row.cancellation_settlement_error ?? "") === GIFT_CARD_STILL_HELD ||
          String(row.cancellation_settlement_error ?? "").startsWith(GIFT_VALUE_STILL_DUE)) &&
        !hasOpenCredit
      ) {
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

    const loyaltyRetried = await retrySettledLoyalty(admin);
    const giftsReturned = await retryHeldGiftCards(admin);

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

    return NextResponse.json({
      ok: true,
      settled,
      open,
      loyalty_retried: loyaltyRetried,
      gifts_returned: giftsReturned,
      reschedule_finalized: rescheduleFinalized,
    });
  });
}

async function retrySettledLoyalty(
  admin: ReturnType<typeof getSupabaseAdmin>,
): Promise<number> {
  const { data, error } = await admin
    .from("bookings")
    .select("id, tenant_id, customer_id, booking_number, cancellation_settlement_attempts")
    .eq("cancellation_settlement_error", LOYALTY_POINTS_STILL_DUE)
    .limit(100);
  if (error) {
    console.warn("[settle-pending-cancellations] loyalty retry query failed", error);
    return 0;
  }

  let finished = 0;
  for (const row of data ?? []) {
    const loyalty = await finishCancellationLoyalty(admin, {
      id: row.id,
      customer_id: row.customer_id,
      booking_number: row.booking_number,
    });
    if (loyalty.stillDue) {
      const attempts = Number(row.cancellation_settlement_attempts ?? 0) + 1;
      await admin
        .from("bookings")
        .update({ cancellation_settlement_attempts: attempts })
        .eq("id", row.id);
      if (attempts === ALERT_AFTER_ATTEMPTS) {
        slackNotifyCancellationSettlementStuck({
          tenantId: row.tenant_id,
          bookingId: row.id,
          reason: LOYALTY_POINTS_STILL_DUE,
        });
      }
      continue;
    }
    const { data: cleared } = await admin
      .from("bookings")
      .update({ cancellation_settlement_error: null })
      .eq("id", row.id)
      .eq("cancellation_settlement_error", LOYALTY_POINTS_STILL_DUE)
      .select("id");
    if ((cleared?.length ?? 0) > 0) finished += 1;
  }
  return finished;
}

async function recordGiftValueRefundOnce(
  admin: ReturnType<typeof getSupabaseAdmin>,
  bookingId: string,
  amount: number,
): Promise<boolean> {
  const marker = `gift_value_still_due:${bookingId}`;
  const { data: existing, error: lookupErr } = await admin
    .from("booking_refunds")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("notes", marker)
    .limit(1);
  if (lookupErr) {
    console.warn("[settle-pending-cancellations] gift refund lookup failed", bookingId, lookupErr);
    return false;
  }
  if ((existing?.length ?? 0) > 0) return true;
  const { error } = await admin.from("booking_refunds").insert({
    booking_id: bookingId,
    amount,
    reason: "Gift card value returned",
    refund_method: "store_credit",
    status: "completed",
    notes: marker,
  });
  if (!error) return true;
  const message = String((error as { message?: string }).message ?? error);
  if (message.toLowerCase().includes("exceeds")) return true;
  console.warn("[settle-pending-cancellations] gift refund record failed", bookingId, error);
  return false;
}

async function retryHeldGiftCards(
  admin: ReturnType<typeof getSupabaseAdmin>,
): Promise<number> {
  const held = await admin
    .from("bookings")
    .select(
      "id, tenant_id, customer_id, booking_number, currency, status, gift_card_amount, cancellation_settlement_error, cancellation_settlement_attempts",
    )
    .eq("cancellation_settlement_error", GIFT_CARD_STILL_HELD)
    .limit(100);
  const valueDue = await admin
    .from("bookings")
    .select(
      "id, tenant_id, customer_id, booking_number, currency, status, gift_card_amount, cancellation_settlement_error, cancellation_settlement_attempts",
    )
    .like("cancellation_settlement_error", `${GIFT_VALUE_STILL_DUE}%`)
    .limit(100);
  if (held.error || valueDue.error) {
    console.warn(
      "[settle-pending-cancellations] gift card retry query failed",
      held.error ?? valueDue.error,
    );
    return 0;
  }
  const data = [...(held.data ?? []), ...(valueDue.data ?? [])];

  let finished = 0;
  for (const row of data ?? []) {
    let returned = false;
    try {
      const { data: voided, error: voidErr } = await (admin.rpc as any)("void_gift_card_redemption", {
        p_booking_id: row.id,
      });
      if (voidErr) {
        console.warn("[settle-pending-cancellations] gift card void failed", row.id, voidErr);
      } else {
        const heldOut = giftValueStillDueAmount(String(row.cancellation_settlement_error ?? ""));
        const outcome = bookingGiftVoidOutcome(voided);
        if (outcome === "restored") {
          await admin
            .from("bookings")
            .update({ gift_card_amount: 0, gift_card_id: null })
            .eq("id", row.id);
          returned =
            heldOut != null && heldOut > 0.009
              ? await recordGiftValueRefundOnce(admin, row.id, heldOut)
              : true;
        } else if (outcome === "spent") {
          const visitClosed = visitClosedForGiftReturn(row.status);
          const amount = spentGiftReturnAmount(
            heldOut,
            Number(row.gift_card_amount ?? 0),
            visitClosed,
          );
          if (amount > 0.009 && row.customer_id) {
            const { error: creditErr } = await (admin.rpc as any)("wallet_credit_admin", {
              p_user_id: row.customer_id,
              p_amount: amount,
              p_currency: row.currency || "ZAR",
              p_description: `Gift card value for booking ${row.booking_number || row.id}`,
              p_reference_id: row.id,
              p_reference_type: "booking_refund",
              p_tenant_id: row.tenant_id,
              p_idempotency_key: `gift_value_still_due:${row.id}`,
            });
            if (creditErr) {
              console.warn("[settle-pending-cancellations] gift value credit failed", row.id, creditErr);
            } else {
              returned = await recordGiftValueRefundOnce(admin, row.id, amount);
              if (returned) {
                await admin
                  .from("bookings")
                  .update({ gift_card_amount: 0, gift_card_id: null })
                  .eq("id", row.id);
              }
            }
          } else if (amount <= 0.009) {
            returned = true;
          }
        }
      }
    } catch (err) {
      console.warn("[settle-pending-cancellations] gift card void failed", row.id, err);
    }
    if (!returned) {
      const attempts = Number(row.cancellation_settlement_attempts ?? 0) + 1;
      await admin
        .from("bookings")
        .update({ cancellation_settlement_attempts: attempts })
        .eq("id", row.id);
      if (attempts === ALERT_AFTER_ATTEMPTS) {
        slackNotifyCancellationSettlementStuck({
          tenantId: row.tenant_id,
          bookingId: row.id,
          reason: GIFT_CARD_STILL_HELD,
        });
      }
      continue;
    }
    const loyalty = await finishCancellationLoyalty(admin, {
      id: row.id,
      customer_id: row.customer_id,
      booking_number: row.booking_number,
    });
    const { data: cleared } = await admin
      .from("bookings")
      .update({
        cancellation_settlement_error: loyalty.stillDue ? LOYALTY_POINTS_STILL_DUE : null,
      })
      .eq("id", row.id)
      .eq("cancellation_settlement_error", row.cancellation_settlement_error)
      .select("id");
    if ((cleared?.length ?? 0) > 0) finished += 1;
  }
  return finished;
}
