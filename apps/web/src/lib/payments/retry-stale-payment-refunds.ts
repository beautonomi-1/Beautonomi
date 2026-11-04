import type { SupabaseClient } from "@supabase/supabase-js";
import { refundGatewayCharge } from "@/lib/payments/refund-gateway-charge";
import { convertFromSmallestUnit } from "@/lib/payments/paystack-complete";
import { staleCustomOfferRefundAmountMajor } from "@/lib/custom-offers/auto-refund-stale-custom-offer-payment";
import { slackNotifyCronJobFailed } from "@/lib/integrations/slack/ops-triggers";

const STALE_RETRY_MIN_AGE_MS = 10 * 60 * 1000;
const STALE_RETRY_MAX_ATTEMPTS = 5;
const BATCH_LIMIT = 50;

type StaleRow = {
  id: string;
  source_type: string;
  source_id: string;
  payment_reference: string;
  amount_minor: number | null;
  currency: string | null;
  tenant_id: string | null;
  attempt_count: number;
  reason: string | null;
};

export type RetryStalePaymentRefundsSummary = {
  attempted: number;
  completed: number;
  failed: number;
  skipped: number;
};

function staleRefundIdempotencyKey(row: StaleRow): string {
  if (row.source_type === "custom_offer") {
    return `stale-refund:${row.id}`;
  }
  return `group-guest-stale:${row.source_id}:${row.payment_reference}`;
}

async function retryOneStaleRefund(
  admin: SupabaseClient,
  row: StaleRow,
): Promise<"completed" | "failed" | "skipped"> {
  const reference = row.payment_reference?.trim();
  if (!reference) return "skipped";

  const currency = row.currency ?? "ZAR";
  let amountMajor: number | null = null;
  if (row.source_type === "custom_offer") {
    amountMajor = staleCustomOfferRefundAmountMajor(row.amount_minor, currency);
  } else if (row.source_type === "group_participant") {
    amountMajor =
      typeof row.amount_minor === "number" && Number.isFinite(row.amount_minor)
        ? convertFromSmallestUnit(row.amount_minor, currency)
        : null;
  }
  if (amountMajor == null || amountMajor <= 0) return "skipped";

  const nextAttempt = row.attempt_count + 1;
  const { data: claimed, error: claimErr } = await admin
    .from("stale_payment_refunds")
    .update({
      attempt_count: nextAttempt,
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .in("refund_status", ["pending", "failed"])
    .lt("attempt_count", STALE_RETRY_MAX_ATTEMPTS)
    .select("id")
    .maybeSingle();

  if (claimErr || !claimed) return "skipped";

  try {
    const result = await refundGatewayCharge({
      reference,
      amountMajor,
      currency,
      tenantId: row.tenant_id,
      reason: row.reason ?? `Stale payment refund (${row.source_type})`,
      idempotencyKey: staleRefundIdempotencyKey(row),
    });
    await admin
      .from("stale_payment_refunds")
      .update({
        refund_status: "completed",
        paystack_refund_reference: result.refundId ?? reference,
        failure_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return "completed";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin
      .from("stale_payment_refunds")
      .update({
        refund_status: "failed",
        failure_reason: msg.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (nextAttempt >= STALE_RETRY_MAX_ATTEMPTS) {
      await slackNotifyCronJobFailed({
        cronJob: "retry-stale-payment-refunds",
        error: `max attempts for stale refund ${row.id} (${row.source_type})`,
      });
    }
    return "failed";
  }
}

export async function retryStalePaymentRefunds(
  admin: SupabaseClient,
  options?: { now?: Date },
): Promise<RetryStalePaymentRefundsSummary> {
  const now = options?.now ?? new Date();
  const beforeIso = new Date(now.getTime() - STALE_RETRY_MIN_AGE_MS).toISOString();

  const summary: RetryStalePaymentRefundsSummary = {
    attempted: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };

  const { data: rows, error } = await admin
    .from("stale_payment_refunds")
    .select(
      "id, source_type, source_id, payment_reference, amount_minor, currency, tenant_id, attempt_count, reason, last_attempt_at, created_at",
    )
    .in("refund_status", ["pending", "failed"])
    .in("source_type", ["custom_offer", "group_participant"])
    .lt("attempt_count", STALE_RETRY_MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[retryStalePaymentRefunds] query failed:", error);
    return summary;
  }

  const eligible = (rows ?? []).filter((raw) => {
    const row = raw as StaleRow & { last_attempt_at?: string | null; created_at?: string };
    const last = row.last_attempt_at ?? row.created_at;
    if (!last) return true;
    return new Date(last).getTime() <= now.getTime() - STALE_RETRY_MIN_AGE_MS;
  });

  for (const raw of eligible) {
    const row = raw as StaleRow;
    summary.attempted += 1;
    const outcome = await retryOneStaleRefund(admin, row);
    if (outcome === "completed") summary.completed += 1;
    else if (outcome === "failed") summary.failed += 1;
    else summary.skipped += 1;
  }

  return summary;
}
