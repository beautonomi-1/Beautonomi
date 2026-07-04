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
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

export type TerminalCommercialModel =
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
): Promise<{ ok: boolean; duplicate: boolean; financeTransactionId: string | null; transitionedToPaid: boolean }> {
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
): Promise<{ ok: boolean; duplicate: boolean; financeTransactionId: string | null; transitionedToPaid: boolean }> {
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
    .select("id, tenant_id, provider_id, total_amount, commercial_model, order_status, invoice_status, finance_transaction_id")
    .eq("id", terminalOrderId)
    .maybeSingle();

  if (orderErr || !order) {
    throw orderErr ?? new Error("Terminal order not found");
  }

  const orderRow = order as {
    tenant_id?: string | null;
    provider_id?: string | null;
    total_amount?: number | null;
    commercial_model?: TerminalCommercialModel;
    finance_transaction_id?: string | null;
  };

  const accountingEnabled = await isFeatureEnabledServer(
    FEATURE_FLAG_KEYS.TERMINAL_ACCOUNTING,
    orderRow.tenant_id ?? null,
  );

  // Idempotency: check for existing payment_transaction for this reference
  const { data: existingTx } = await (supabase.from("payment_transactions") as any)
    .select("id")
    .eq("provider", provider)
    .eq("reference", reference)
    .maybeSingle();

  if (existingTx) {
    return {
      ok: true,
      duplicate: true,
      financeTransactionId: (order as any).finance_transaction_id ?? null,
      transitionedToPaid: false,
    };
  }

  const wasAlreadyPaid = String((order as any).invoice_status ?? "") === "paid";

  // Resolve finance tenant
  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: (order as any).tenant_id ?? null,
    provider_id: (order as any).provider_id ?? null,
  });

  // Map commercial model → GL transaction type
  const resolvedModel =
    commercialModel ??
    (orderRow.commercial_model as TerminalCommercialModel | undefined) ??
    "once_off_purchase";
  const transactionType = TRANSACTION_TYPE_MAP[resolvedModel] ?? "terminal_sale";

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
      commercial_model: resolvedModel,
      source,
    },
    created_at: new Date().toISOString(),
  });

  if (payTxErr) {
    if (payTxErr.code === "23505") {
      return { ok: true, duplicate: true, financeTransactionId: null, transitionedToPaid: false };
    }
    throw payTxErr;
  }

  let financeTransactionId: string | null = null;

  if (accountingEnabled) {
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
          commercial_model: resolvedModel,
          reference,
          source,
        },
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (finTxErr) throw finTxErr;
    financeTransactionId = (finTx as { id?: string }).id ?? null;
  } else {
    console.warn(
      `[recordTerminalOrderPayment] terminal_accounting_enabled off — marking order paid without ledger for ${terminalOrderId}`,
    );
  }

  // Update terminal order: confirmed, invoice issued, finance tx linked, accounting pending
  await (supabase.from("terminal_orders") as any)
    .update({
      order_status: "confirmed",
      invoice_status: "paid",
      accounting_sync_status: accountingEnabled ? "pending" : "skipped",
      finance_transaction_id: financeTransactionId,
      paystack_reference: reference,
    })
    .eq("id", terminalOrderId);

  if (!wasAlreadyPaid) {
    try {
      const { finalizeTerminalOrderAfterPayment } = await import(
        "@/lib/terminal/finalize-terminal-order-after-payment"
      );
      await finalizeTerminalOrderAfterPayment({ supabase, terminalOrderId });
    } catch (finalizeErr) {
      console.error("[recordTerminalOrderPayment] finalize failed:", finalizeErr);
    }
  }

  return {
    ok: true,
    duplicate: false,
    financeTransactionId,
    transitionedToPaid: !wasAlreadyPaid,
  };
}
