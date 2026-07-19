/**
 * Refund pre-processor — turns a ~10-minute manual investigation into a
 * ~30-second review. For every pending booking refund the agent assembles:
 *
 *   - how the booking was paid (methods, providers, amounts)
 *   - what was already refunded
 *   - the in-person refundable cap (existing deterministic finance code)
 *   - the customer's recent refund history (repeat-refunder signal)
 *
 * and proposes a `refund.briefing` with a recommended maximum and risk flags.
 * The human still decides; on approval the briefing is stamped into the
 * refund's notes for the processor to act on.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadAgentDefinition, loadAgentModuleConfig, loadAgentOperationalState } from "../config-loader";
import { assertAgentReadAllowed } from "../safety-gate";
import { proposeAgentAction } from "../actions/action-service";
import {
  computeInPersonRefundableCap,
  fetchBookingPaymentsForRefundCap,
  fetchCompletedCashRefundsTotal,
} from "@/lib/bookings/booking-refund-limits";
import { hashPayload } from "@beautonomi/agent-policy";

const PER_TENANT_LIMIT = 10;

export type RefundBriefing = {
  requestedAmount: number;
  bookingTotal: number;
  totalPaid: number;
  alreadyRefunded: number;
  recommendedMax: number;
  inPersonCap: number;
  paymentBreakdown: string;
  customerRefunds90d: number;
  flags: string[];
  summary: string;
};

export function buildRefundBriefing(input: {
  requestedAmount: number;
  bookingTotal: number;
  totalPaid: number;
  alreadyRefunded: number;
  inPersonCap: number;
  refundMethod: string | null;
  paymentBreakdown: string;
  customerRefunds90d: number;
}): RefundBriefing {
  const flags: string[] = [];
  const remainingRefundable = Math.max(0, input.totalPaid - input.alreadyRefunded);
  const method = (input.refundMethod ?? "original").toLowerCase();
  const methodCap = method === "cash" ? Math.min(remainingRefundable, input.inPersonCap) : remainingRefundable;
  const recommendedMax = Math.round(Math.min(input.requestedAmount, methodCap) * 100) / 100;

  if (input.requestedAmount > remainingRefundable) {
    flags.push(`requested_exceeds_refundable_balance (${remainingRefundable.toFixed(2)} left)`);
  }
  if (method === "cash" && input.requestedAmount > input.inPersonCap) {
    flags.push(`cash_refund_exceeds_in_person_cap (${input.inPersonCap.toFixed(2)})`);
  }
  if (input.alreadyRefunded > 0) {
    flags.push(`booking_already_partially_refunded (${input.alreadyRefunded.toFixed(2)})`);
  }
  if (input.customerRefunds90d >= 3) {
    flags.push(`repeat_refunder (${input.customerRefunds90d} refunds in 90 days)`);
  }
  if (input.totalPaid === 0) {
    flags.push("no_completed_payments_on_booking");
  }

  const summary =
    flags.length === 0
      ? `Clean refund: ${input.requestedAmount.toFixed(2)} requested of ${remainingRefundable.toFixed(2)} refundable (paid ${input.totalPaid.toFixed(2)} via ${input.paymentBreakdown || "n/a"}). Recommended max ${recommendedMax.toFixed(2)}.`
      : `Review required: ${flags.join("; ")}. Paid ${input.totalPaid.toFixed(2)} via ${input.paymentBreakdown || "n/a"}; already refunded ${input.alreadyRefunded.toFixed(2)}. Recommended max ${recommendedMax.toFixed(2)}.`;

  return {
    requestedAmount: input.requestedAmount,
    bookingTotal: input.bookingTotal,
    totalPaid: input.totalPaid,
    alreadyRefunded: input.alreadyRefunded,
    recommendedMax,
    inPersonCap: input.inPersonCap,
    paymentBreakdown: input.paymentBreakdown,
    customerRefunds90d: input.customerRefunds90d,
    flags,
    summary,
  };
}

async function countCustomerRefunds90d(supabase: SupabaseClient, customerId: string): Promise<number> {
  const since = new Date(Date.now() - 90 * 24 * 3600_000).toISOString();
  const { data: bookingIds } = await supabase
    .from("bookings")
    .select("id")
    .eq("customer_id", customerId)
    .gte("created_at", since)
    .limit(200);
  const ids = (bookingIds ?? []).map((b: { id: string }) => b.id);
  if (ids.length === 0) return 0;
  const { count } = await supabase
    .from("booking_refunds")
    .select("id", { count: "exact", head: true })
    .in("booking_id", ids)
    .in("status", ["pending", "completed"]);
  return count ?? 0;
}

function isDuplicate(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = String((err as { message?: string } | null)?.message ?? err ?? "");
  return code === "23505" || /duplicate|unique/i.test(message);
}

export async function runRefundBriefingSweepForTenant(params: {
  tenantId: string;
  environment?: string;
}): Promise<{ skipped: true; reason: string } | { briefings: number; errors: string[] }> {
  const agentModule = await loadAgentModuleConfig(params.environment);
  const gate = assertAgentReadAllowed({ masterEnabled: agentModule.masterEnabled });
  if (!gate.allowed) return { skipped: true, reason: gate.reason ?? "gated" };

  const def = await loadAgentDefinition("reconciliation-investigator");
  if (!def) return { skipped: true, reason: "agent_not_configured" };
  const op = await loadAgentOperationalState("reconciliation-investigator");
  if (op.state !== "active") return { skipped: true, reason: "agent_not_active" };

  const supabase = getSupabaseAdmin();
  let briefings = 0;
  const errors: string[] = [];

  // Tenant-scope via !inner join — never sample global pending refunds then
  // filter (that starves quieter tenants when another tenant has a backlog).
  const { data: refunds } = await supabase
    .from("booking_refunds")
    .select(
      "id, booking_id, amount, reason, refund_method, status, notes, created_at, booking:bookings!inner(id, tenant_id, customer_id, total_amount, total_paid, total_refunded, currency)",
    )
    .eq("status", "pending")
    .eq("booking.tenant_id", params.tenantId)
    .order("created_at", { ascending: true })
    .limit(PER_TENANT_LIMIT);

  for (const refund of refunds ?? []) {
    if (briefings >= PER_TENANT_LIMIT) break;
    if (String(refund.notes ?? "").includes("[Agent briefing")) continue;
    try {
      const booking = refund.booking as unknown as {
        id: string;
        tenant_id?: string | null;
        customer_id: string;
        total_amount?: number | null;
        total_paid?: number | null;
        total_refunded?: number | null;
        currency?: string | null;
      } | null;
      if (!booking) continue;

      const payments = await fetchBookingPaymentsForRefundCap(supabase, refund.booking_id, params.tenantId);
      const cashRefunded = await fetchCompletedCashRefundsTotal(supabase, refund.booking_id);
      const inPersonCap = computeInPersonRefundableCap(payments, cashRefunded);
      const paymentBreakdown = payments
        .filter((p) => p.status === "completed" || p.status === "partially_refunded")
        .map((p) => `${p.payment_method ?? "?"}/${p.payment_provider ?? "?"} ${Number(p.amount ?? 0).toFixed(2)}`)
        .join(", ");
      const customerRefunds90d = await countCustomerRefunds90d(supabase, String(booking.customer_id));

      const briefing = buildRefundBriefing({
        requestedAmount: Number(refund.amount ?? 0),
        bookingTotal: Number(booking.total_amount ?? 0),
        totalPaid: Number(booking.total_paid ?? 0),
        alreadyRefunded: Number(booking.total_refunded ?? 0),
        inPersonCap,
        refundMethod: refund.refund_method as string | null,
        paymentBreakdown,
        customerRefunds90d,
      });

      await proposeAgentAction({
        tenantId: params.tenantId,
        agentId: def.id,
        actionType: "refund.briefing",
        targetType: "booking_refund",
        targetId: String(refund.id),
        proposedPayload: { refundId: refund.id, bookingId: refund.booking_id, briefing },
        reasoningSummary: briefing.summary,
        riskLevel: 2,
        policyVersion: def.active_version,
        idempotencyKey: `refund-briefing:${refund.id}:${hashPayload(briefing).slice(0, 16)}`,
      });
      briefings += 1;
    } catch (err) {
      if (!isDuplicate(err)) errors.push(`refund:${refund.id}:${String(err).slice(0, 120)}`);
    }
  }

  return { briefings, errors };
}
