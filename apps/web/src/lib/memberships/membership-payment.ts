/**
 * Idempotent membership payment ledger helper.
 *
 * Every membership money event (initial purchase, auto-renewal cron, renewal
 * webhook back-stop) posts exactly one:
 *   - payment_transactions  (kind: membership_order | membership_renewal)
 *   - finance_transactions  membership_sale   (gross)
 *   - finance_transactions  provider_earnings (net = gross - fees)
 *
 * Idempotency key: payment_transactions.reference (Paystack reference).
 * 23505 (unique-violation) guard on finance_transactions inserts prevents
 * concurrent webhook + cron from double-posting.
 *
 * Commission is intentionally 0 — provider keeps gross minus Paystack fees.
 */
import { subtractMoney } from "@beautonomi/utils";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";

export type RecordMembershipPaymentParams = {
  supabase: SupabaseClient;
  /** Paystack reference — idempotency key. */
  reference: string;
  orderId: string;
  userId: string;
  providerId: string;
  planId: string;
  /** Gross amount in major currency units (already converted from kobo/cents). */
  grossAmount: number;
  /** Paystack fee in major currency units. */
  feeAmount: number;
  /** "membership_order" for initial purchase, "membership_renewal" for cron charges. */
  kind: "membership_order" | "membership_renewal";
  tenantIdHint?: string | null;
  /** Payment rail. Defaults to Paystack (webhook / saved-card). Wallet purchases use "wallet". */
  paymentProvider?: "paystack" | "stripe" | "flutterwave" | "wallet";
};

export type RecordMembershipPaymentResult = {
  recorded: boolean;
  alreadyRecorded: boolean;
  netAmount: number;
  reference: string;
};

export async function recordMembershipPayment(
  params: RecordMembershipPaymentParams,
): Promise<RecordMembershipPaymentResult> {
  const {
    supabase,
    reference,
    orderId,
    userId,
    providerId,
    planId,
    grossAmount,
    feeAmount,
    kind,
    tenantIdHint = null,
    paymentProvider = "paystack",
  } = params;

  const netAmount = Math.max(0, subtractMoney(grossAmount, feeAmount));

  if (!reference || !providerId) {
    console.error("[recordMembershipPayment] missing reference or providerId", { reference, providerId });
    return { recorded: false, alreadyRecorded: false, netAmount, reference };
  }

  // Idempotency: one recognized payment per Paystack reference.
  // A prior failed row must not block a later successful recognition.
  const { data: existingTx } = await supabase
    .from("payment_transactions")
    .select("id, status")
    .eq("provider", paymentProvider)
    .eq("reference", reference)
    .maybeSingle();

  if (existingTx) {
    const existingStatus = String(
      (existingTx as { status?: string }).status ?? "",
    ).toLowerCase();
    if (existingStatus === "success") {
      const savedTenantId = await resolveTenantIdForFinanceLedger(supabase, {
        tenant_id: tenantIdHint,
        provider_id: providerId,
      });
      await ensureMembershipFinanceLegs(supabase, {
        providerId,
        financeTenantId: savedTenantId,
        reference,
        orderId,
        planId,
        userId,
        grossAmount,
        feeAmount,
        netAmount,
        kind,
        nowIso: new Date().toISOString(),
      });
      return { recorded: false, alreadyRecorded: true, netAmount, reference };
    }
    if (existingStatus === "failed") {
      await supabase
        .from("payment_transactions")
        .delete()
        .eq("id", (existingTx as { id: string }).id);
    } else {
      return { recorded: false, alreadyRecorded: true, netAmount, reference };
    }
  }

  const financeTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: tenantIdHint,
    provider_id: providerId,
  });

  const nowIso = new Date().toISOString();

  // payment_transactions row
  const { error: ptErr } = await supabase.from("payment_transactions").insert({
    booking_id: null,
    reference,
    amount: grossAmount,
    fees: feeAmount,
    net_amount: netAmount,
    status: "success",
    provider: paymentProvider,
    transaction_type: "charge",
    metadata: {
      kind,
      membership_order_id: orderId,
      user_id: userId,
      plan_id: planId,
      provider_id: providerId,
    },
    created_at: nowIso,
  });

  if (ptErr) {
    // 23505 = unique_violation; the record was inserted by a concurrent call.
    if ((ptErr as { code?: string }).code === "23505") {
      await ensureMembershipFinanceLegs(supabase, {
        providerId,
        financeTenantId,
        reference,
        orderId,
        planId,
        userId,
        grossAmount,
        feeAmount,
        netAmount,
        kind,
        nowIso,
      });
      return { recorded: false, alreadyRecorded: true, netAmount, reference };
    }
    console.error("[recordMembershipPayment] payment_transactions insert error:", ptErr);
    throw ptErr;
  }

  await ensureMembershipFinanceLegs(supabase, {
    providerId,
    financeTenantId,
    reference,
    orderId,
    planId,
    userId,
    grossAmount,
    feeAmount,
    netAmount,
    kind,
    nowIso,
  });

  return { recorded: true, alreadyRecorded: false, netAmount, reference };
}

async function ensureMembershipFinanceLegs(
  supabase: SupabaseClient,
  input: {
    providerId: string;
    financeTenantId: string | null;
    reference: string;
    orderId: string;
    planId: string;
    userId: string;
    grossAmount: number;
    feeAmount: number;
    netAmount: number;
    kind: "membership_order" | "membership_renewal";
    nowIso: string;
  },
): Promise<void> {
  const { data: existingLegs, error: legsError } = await supabase
    .from("finance_transactions")
    .select("transaction_type")
    .eq("provider_id", input.providerId)
    .contains("metadata", { reference: input.reference })
    .in("transaction_type", ["membership_sale", "membership_provider_earnings"]);
  if (legsError) {
    console.error("[recordMembershipPayment] finance leg lookup failed:", legsError);
    return;
  }
  const have = new Set(
    (existingLegs ?? []).map((row) =>
      String((row as { transaction_type?: string }).transaction_type ?? ""),
    ),
  );

  if (!have.has("membership_sale")) {
    const { error: ftSaleErr } = await supabase.from("finance_transactions").insert({
      booking_id: null,
      provider_id: input.providerId,
      tenant_id: input.financeTenantId,
      transaction_type: "membership_sale",
      amount: input.grossAmount,
      fees: input.feeAmount,
      commission: 0,
      net: 0,
      description:
        input.kind === "membership_renewal" ? "Membership renewal (gross)" : "Membership sale (gross)",
      metadata: {
        kind: input.kind,
        reference: input.reference,
        membership_order_id: input.orderId,
        plan_id: input.planId,
        user_id: input.userId,
      },
      created_at: input.nowIso,
    });
    if (ftSaleErr && (ftSaleErr as { code?: string }).code !== "23505") {
      console.error("[recordMembershipPayment] finance_transactions membership_sale error:", ftSaleErr);
    }
  }

  if (!have.has("membership_provider_earnings")) {
    const { error: ftEarnErr } = await supabase.from("finance_transactions").insert({
      booking_id: null,
      provider_id: input.providerId,
      tenant_id: input.financeTenantId,
      transaction_type: "membership_provider_earnings",
      amount: input.grossAmount,
      fees: input.feeAmount,
      commission: 0,
      net: input.netAmount,
      description:
        input.kind === "membership_renewal"
          ? "Provider earnings from membership renewal"
          : "Provider earnings from membership sale",
      metadata: {
        kind: input.kind,
        reference: input.reference,
        membership_order_id: input.orderId,
        plan_id: input.planId,
      },
      created_at: input.nowIso,
    });
    if (ftEarnErr && (ftEarnErr as { code?: string }).code !== "23505") {
      console.error("[recordMembershipPayment] finance_transactions provider_earnings error:", ftEarnErr);
    }
  }
}
