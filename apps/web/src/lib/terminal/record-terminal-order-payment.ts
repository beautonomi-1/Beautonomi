/**
 * recordTerminalOrderPayment — idempotent money choke-point for terminal
 * purchase, rental, bundle, and promotional transactions.
 *
 * Mirrors record-product-order-payment.ts. Each terminal commercial model maps
 * to a distinct finance_transactions.transaction_type:
 *   once_off_purchase  → terminal_sale
 *   rental             → terminal_rental
 *   subscription_bundle_alloc → terminal_bundle_alloc
 *   promotional        → terminal_promotion
 *
 * Idempotency: deduplicated via payment_transactions(provider, reference)
 * with a UNIQUE constraint on (provider, reference).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";

type TerminalCommercialModel =
  | "once_off_purchase"
  | "rental"
  | "subscription_bundle"
  | "lease_to_own"
  | "financed"
  | "promotional";

const TRANSACTION_TYPE_MAP: Record<TerminalCommercialModel, string> = {
  once_off_purchase: "terminal_sale",
  rental: "terminal_rental",
  subscription_bundle: "terminal_bundle_alloc",
  lease_to_own: "terminal_sale",
  financed: "terminal_sale",
  promotional: "terminal_promotion",
};

type RecordTerminalOrderPaymentInput = {
  supabase: SupabaseClient;
  terminalOrderId: string;
  reference: string;
  amountMajor: number;
  feesMajor?: number;
  commercialModel: TerminalCommercialModel;
  source: "paystack_webhook" | "paystack_verify" | "manual_invoice" | "subscription_allocation";
  provider: "paystack" | "manual" | "subscription";
};

export async function recordTerminalOrderPayment(
  input: RecordTerminalOrderPaymentInput,
): Promise<{ ok: boolean; duplicate: boolean; financeTransactionId: string | null }> {
  return Sentry.startSpan(
    {
      name: "finance.recordTerminalOrderPayment",
      op: "finance.ledger.write",
      attributes: {
        "finance.terminal_order_id": input.terminalOrderId,
        "finance.commercial_model": input.commercialModel,
        "finance.source": input.source,
        "finance.amount": input.amountMajor,
      },
    },
    () => recordTerminalOrderPaymentInner(input),
  );
}

async function recordTerminalOrderPaymentInner(
  input: RecordTerminalOrderPaymentInput,
): Promise<{ ok: boolean; duplicate: boolean; financeTransactionId: string | null }> {
  const {
    supabase,
    terminalOrderId,
    reference,
    amountMajor,
    feesMajor = 0,
    commercialModel,
    source,
    provider,
  } = input;

  // Load order
  const { data: order, error: orderErr } = await (supabase.from("terminal_orders") as any)
    .select("id, tenant_id, provider_id, total_amount, order_status, invoice_status, finance_transaction_id")
    .eq("id", terminalOrderId)
    .maybeSingle();

  if (orderErr || !order) {
    throw orderErr ?? new Error("Terminal order not found");
  }

  // Idempotency: check for existing payment_transaction for this reference
  const { data: existingTx } = await (supabase.from("payment_transactions") as any)
    .select("id")
    .eq("provider", provider)
    .eq("reference", reference)
    .maybeSingle();

  if (existingTx) {
    return { ok: true, duplicate: true, financeTransactionId: (order as any).finance_transaction_id ?? null };
  }

  // Resolve finance tenant
  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: (order as any).tenant_id ?? null,
    provider_id: (order as any).provider_id ?? null,
  });

  // Map commercial model → GL transaction type
  const transactionType = TRANSACTION_TYPE_MAP[commercialModel] ?? "terminal_sale";

  // Insert payment_transactions audit record
  const { error: payTxErr } = await (supabase.from("payment_transactions") as any).insert({
    reference,
    amount: amountMajor,
    fees: feesMajor,
    net_amount: amountMajor - feesMajor,
    status: "success",
    provider,
    transaction_type: "charge",
    metadata: {
      kind: "terminal_order",
      terminal_order_id: terminalOrderId,
      commercial_model: commercialModel,
      source,
    },
    created_at: new Date().toISOString(),
  });

  if (payTxErr) {
    if (payTxErr.code === "23505") {
      return { ok: true, duplicate: true, financeTransactionId: null };
    }
    throw payTxErr;
  }

  // Insert finance_transactions row (drives shadow GL trigger)
  const { data: finTx, error: finTxErr } = await (supabase.from("finance_transactions") as any)
    .insert({
      provider_id: (order as any).provider_id ?? null,
      tenant_id: financeTenantId,
      transaction_type: transactionType,
      amount: amountMajor,
      fees: feesMajor,
      commission: 0,
      net: amountMajor - feesMajor,
      description: `Terminal order ${transactionType} — ${terminalOrderId}`,
      metadata: {
        terminal_order_id: terminalOrderId,
        commercial_model: commercialModel,
        reference,
        source,
      },
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (finTxErr) throw finTxErr;
  const financeTransactionId = (finTx as { id?: string }).id ?? null;

  // Update terminal order: confirmed, invoice issued, finance tx linked, accounting pending
  await (supabase.from("terminal_orders") as any)
    .update({
      order_status: "confirmed",
      invoice_status: "paid",
      accounting_sync_status: "pending",
      finance_transaction_id: financeTransactionId,
    })
    .eq("id", terminalOrderId);

  return { ok: true, duplicate: false, financeTransactionId };
}
