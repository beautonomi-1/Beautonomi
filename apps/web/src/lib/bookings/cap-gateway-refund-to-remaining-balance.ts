/**
 * F2-33: gateway refund webhooks (Paystack / Stripe / Flutterwave) used to
 * insert whatever amount the gateway reported as a `completed` booking refund.
 * A gateway-side over-refund (dashboard refund twice, FX drift, replayed
 * event) therefore pushed `bookings.total_refunded` above `total_paid`.
 *
 * This helper clamps the amount we record against the booking to the
 * remaining refundable balance (`total_paid − total_refunded`) and opens a
 * reconciliation exception when the gateway amount exceeded it so finance
 * can investigate the real money movement.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { roundCurrency, subtractMoney } from "@beautonomi/utils";
import { recordReconciliationException } from "@/lib/finance/record-reconciliation-exception";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";

export type CapGatewayRefundResult = {
  /** Amount that may be recorded as a booking refund (≥ 0). */
  amount: number;
  /** True when the gateway amount exceeded the remaining refundable balance. */
  capped: boolean;
  /** Remaining refundable balance before this refund. */
  remaining: number;
  /** Gateway-reported amount, unchanged. */
  requested: number;
};

export async function capGatewayRefundToRemainingBalance(
  supabase: SupabaseClient,
  params: {
    bookingId: string;
    requestedAmount: number;
    psp: string;
    /** Gateway refund id / reference (for the exception's external_id). */
    refundReference: string;
    currency?: string | null;
  },
): Promise<CapGatewayRefundResult> {
  const requested = roundCurrency(Math.max(0, Number(params.requestedAmount) || 0));

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, total_paid, total_refunded, tenant_id, provider_id, currency")
    .eq("id", params.bookingId)
    .maybeSingle();

  const row = (booking ?? null) as {
    total_paid?: number | string | null;
    total_refunded?: number | string | null;
    tenant_id?: string | null;
    provider_id?: string | null;
    currency?: string | null;
  } | null;

  // Unknown booking: nothing to clamp against; let the caller proceed as before.
  if (!row) return { amount: requested, capped: false, remaining: requested, requested };

  const totalPaid = Number(row.total_paid ?? 0) || 0;
  const totalRefunded = Number(row.total_refunded ?? 0) || 0;
  const remaining = Math.max(0, subtractMoney(totalPaid, totalRefunded));

  if (requested <= remaining + 0.005) {
    return { amount: requested, capped: false, remaining, requested };
  }

  const currency = String(params.currency ?? row.currency ?? "ZAR").toUpperCase();
  try {
    const tenantId = await resolveTenantIdForFinanceLedger(supabase, {
      tenant_id: row.tenant_id ?? null,
      provider_id: row.provider_id ?? null,
    });
    if (tenantId) {
      await recordReconciliationException({
        supabase,
        tenantId,
        currency,
        psp: params.psp,
        externalId: params.refundReference,
        internalId: params.bookingId,
        amount: subtractMoney(requested, remaining),
        mismatchReason: `${params.psp} refund ${params.refundReference} for ${requested.toFixed(2)} exceeds remaining refundable balance ${remaining.toFixed(2)} (paid ${totalPaid.toFixed(2)}, refunded ${totalRefunded.toFixed(2)}); recorded ${remaining.toFixed(2)}`,
        metadata: {
          kind: "gateway_refund_over_remaining_balance",
          booking_id: params.bookingId,
          requested_amount: requested,
          recorded_amount: remaining,
          total_paid: totalPaid,
          total_refunded: totalRefunded,
        },
      });
    }
  } catch (e) {
    console.error("[cap-gateway-refund] reconciliation exception insert failed:", e);
  }

  return { amount: remaining, capped: true, remaining, requested };
}
