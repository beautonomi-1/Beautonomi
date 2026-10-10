import type { SupabaseClient } from "@supabase/supabase-js";
import type { GatewayFeeSource } from "@/lib/payments/resolve-gateway-fees";

const PSP_REPORTED_SOURCES = new Set([
  "paystack",
  "stripe",
  "paystack_terminal_allocation",
  "paystack_terminal_admin_allocation",
]);

export function shouldPatchGatewayFee(feeSource: string | null | undefined): boolean {
  const s = String(feeSource ?? "").toLowerCase();
  if (!s) return true;
  if (s === "stripe_fee_missing" || s === "estimated") return true;
  if (PSP_REPORTED_SOURCES.has(s)) return false;
  return true;
}

function journaledFeeFromRow(row: {
  fees?: number | null;
  metadata?: Record<string, unknown> | null;
}): number {
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const fj = meta.fee_journaled;
  if (fj !== undefined && fj !== null && fj !== "") {
    const n = Number(fj);
    if (Number.isFinite(n)) return n;
  }
  return Number(row.fees ?? 0);
}

async function isFinancePeriodLocked(
  supabase: SupabaseClient,
  tenantId: string | null,
  createdAt: string | null,
): Promise<boolean> {
  if (!tenantId || !createdAt) return false;
  const day = createdAt.slice(0, 10);
  const { data } = await supabase
    .from("financial_period_locks")
    .select("id")
    .eq("tenant_id", tenantId)
    .lte("period_start", day)
    .gte("period_end", day)
    .maybeSingle();
  return Boolean(data);
}

export type ApplyGatewayFeeCorrectionResult =
  | { ok: true; applied: false; reason: "noop" | "skip_source" }
  | { ok: true; applied: true; mode: "column_and_journal" | "adjustment_row" }
  | { ok: false; reason: string };

/**
 * Apply a PSP-reported gateway fee to existing finance rows (open period: RPC + column;
 * locked period: gateway_fee_adjustment insert).
 */
export async function applyGatewayFeeCorrection(
  supabase: SupabaseClient,
  params: {
    financeTxId: string;
    newFeeMajor: number;
    feeSource: GatewayFeeSource | string;
    chargeReference?: string | null;
    providerId?: string | null;
    tenantId?: string | null;
    bookingId?: string | null;
  },
): Promise<ApplyGatewayFeeCorrectionResult> {
  const newFee = Math.round(params.newFeeMajor * 100) / 100;

  const { data: row, error } = await supabase
    .from("finance_transactions")
    .select("id, fees, metadata, created_at, tenant_id, provider_id, booking_id, transaction_type, currency")
    .eq("id", params.financeTxId)
    .maybeSingle();

  if (error || !row) {
    return { ok: false, reason: "finance_row_not_found" };
  }

  const typed = row as {
    fees?: number;
    metadata?: Record<string, unknown> | null;
    created_at?: string;
    tenant_id?: string | null;
    provider_id?: string | null;
    booking_id?: string | null;
    transaction_type?: string;
    currency?: string | null;
  };

  if (typed.transaction_type === "payout" || typed.transaction_type === "payout_transfer_fee") {
    return { ok: true, applied: false, reason: "noop" };
  }

  const existingSource =
    typeof typed.metadata?.fee_source === "string" ? typed.metadata.fee_source : null;
  if (!shouldPatchGatewayFee(existingSource)) {
    return { ok: true, applied: false, reason: "skip_source" };
  }

  const journaled = journaledFeeFromRow(typed);
  const delta = Math.round((newFee - journaled) * 100) / 100;
  if (Math.abs(delta) < 0.0001) {
    return { ok: true, applied: false, reason: "noop" };
  }

  const tenantId = params.tenantId ?? typed.tenant_id ?? null;
  const locked = await isFinancePeriodLocked(supabase, tenantId, typed.created_at ?? null);

  if (!locked) {
    const { error: rpcErr } = await supabase.rpc("post_gateway_fee_delta", {
      p_finance_tx_id: params.financeTxId,
      p_new_fee: newFee,
      p_fee_source: params.feeSource,
    });
    if (rpcErr) {
      return { ok: false, reason: rpcErr.message };
    }
    return { ok: true, applied: true, mode: "column_and_journal" };
  }

  const adjKey = `gateway_fee_adjustment:${params.financeTxId}:${newFee}`;
  const { data: existingAdj } = await supabase
    .from("finance_transactions")
    .select("id")
    .eq("transaction_type", "gateway_fee_adjustment")
    .contains("metadata", { adjustment_key: adjKey })
    .maybeSingle();

  if (existingAdj) {
    return { ok: true, applied: false, reason: "noop" };
  }

  const { error: insErr } = await supabase.from("finance_transactions").insert({
    tenant_id: tenantId,
    provider_id: params.providerId ?? typed.provider_id ?? null,
    booking_id: params.bookingId ?? typed.booking_id ?? null,
    transaction_type: "gateway_fee_adjustment",
    amount: delta,
    fees: delta,
    commission: 0,
    net: 0,
    currency: typed.currency ?? "ZAR",
    description: "Gateway fee correction (locked period)",
    metadata: {
      adjustment_key: adjKey,
      original_finance_tx_id: params.financeTxId,
      target_fee: newFee,
      fee_source: params.feeSource,
      charge_reference: params.chargeReference ?? null,
    },
  });

  if (insErr) {
    return { ok: false, reason: insErr.message };
  }
  return { ok: true, applied: true, mode: "adjustment_row" };
}

/** Find payment / additional_charge_payment finance row by charge reference. */
export async function findChargeFinanceRowForFeePatch(
  supabase: SupabaseClient,
  reference: string,
  bookingId?: string | null,
  productOrderId?: string | null,
): Promise<{ id: string; fees: number; metadata: Record<string, unknown> | null } | null> {
  let q = supabase
    .from("finance_transactions")
    .select("id, fees, metadata")
    .in("transaction_type", ["payment", "additional_charge_payment"])
    .contains("metadata", { reference });

  if (bookingId) {
    q = q.eq("booking_id", bookingId);
  }

  const { data } = await q.limit(5);
  const rows = (data ?? []) as { id: string; fees?: number; metadata?: Record<string, unknown> | null }[];
  let match =
    rows.find((r) => r.metadata?.reference === reference) ??
    rows.find((r) => typeof r.metadata?.paystack_reference === "string") ??
    rows[0];

  if (!match && productOrderId) {
    const { data: poRow } = await supabase
      .from("finance_transactions")
      .select("id, fees, metadata")
      .eq("product_order_id", productOrderId)
      .eq("transaction_type", "payment")
      .maybeSingle();
    if (poRow) match = poRow as typeof match;
  }

  if (!match) {
    const { data: pt } = await supabase
      .from("payment_transactions")
      .select("metadata")
      .eq("reference", reference)
      .eq("provider", "stripe")
      .maybeSingle();
    const poFromPt = (pt as { metadata?: { product_order_id?: string } } | null)?.metadata
      ?.product_order_id;
    if (poFromPt) {
      const { data: poRow } = await supabase
        .from("finance_transactions")
        .select("id, fees, metadata")
        .eq("product_order_id", poFromPt)
        .eq("transaction_type", "payment")
        .maybeSingle();
      if (poRow) match = poRow as typeof match;
    }
  }

  if (!match) return null;
  return {
    id: match.id,
    fees: Number(match.fees ?? 0),
    metadata: match.metadata ?? null,
  };
}
