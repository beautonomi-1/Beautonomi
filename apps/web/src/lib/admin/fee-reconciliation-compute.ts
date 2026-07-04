import type { SupabaseClient } from "@supabase/supabase-js";

export type FeeAutoComputeResult = {
  recorded_fees: number;
  expected_fees_from_config: number;
  charge_count: number;
  payout_transfer_count: number;
};

export type FeeAutoComputeError = {
  code: string;
  message: string;
};

export type ComputeGatewayFeeSuggestionsOptions = {
  tenantId?: string | null;
};

const CHARGE_STATUSES = ["success"] as const;

const LEDGER_FEE_TYPES = [
  "payment",
  "additional_charge_payment",
  "terminal_sale",
  "terminal_rental",
  "terminal_bundle_alloc",
  "terminal_promotion",
  "provider_subscription_payment",
  "provider_ads_payment",
  "provider_marketing_credit_topup",
  "gift_card_sale",
  "wallet_topup",
] as const;

/** Inclusive calendar-date range → ISO bounds on created_at. */
export function feeReconciliationDateBounds(startDate: string, endDate: string): {
  startIso: string;
  endIso: string;
} {
  const start = startDate.trim();
  const end = endDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new Error("start_date and end_date must be YYYY-MM-DD");
  }
  if (start > end) {
    throw new Error("start_date must be on or before end_date");
  }
  return {
    startIso: `${start}T00:00:00.000Z`,
    endIso: `${end}T23:59:59.999Z`,
  };
}

export function normalizeGatewayName(gateway: string): string {
  return gateway.trim().toLowerCase();
}

async function rpcExpectedFee(
  supabase: SupabaseClient,
  gatewayName: string,
  amount: number,
  feeScope: "transaction" | "transfer" | "payout",
): Promise<number> {
  const { data, error } = await supabase.rpc("calculate_expected_fee", {
    gateway_name_param: gatewayName,
    transaction_amount: amount,
    currency_param: "ZAR",
    payment_method_param: "*",
    region_param: "local",
    fee_scope_param: feeScope,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

function feeScopeForLedgerType(transactionType: string): "transaction" | "transfer" {
  return transactionType === "payout" ? "transfer" : "transaction";
}

async function computeFromFinanceLedger(
  supabase: SupabaseClient,
  gatewayName: string,
  startIso: string,
  endIso: string,
  tenantId: string,
): Promise<FeeAutoComputeResult> {
  let ledgerQuery = supabase
    .from("finance_transactions")
    .select("amount, fees, transaction_type")
    .eq("tenant_id", tenantId)
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  const { data: ledgerRows, error: ledgerErr } = await ledgerQuery;
  if (ledgerErr) throw ledgerErr;

  let recordedFees = 0;
  let expectedFromConfig = 0;
  let chargeCount = 0;
  let payoutTransferCount = 0;

  for (const row of ledgerRows ?? []) {
    const txType = String((row as { transaction_type?: string }).transaction_type ?? "");
    const fees = Math.abs(Number((row as { fees?: number }).fees ?? 0));
    const amount = Math.abs(Number((row as { amount?: number }).amount ?? 0));

    if (txType === "payout") {
      if (gatewayName !== "paystack" || fees <= 0) continue;
      payoutTransferCount += 1;
      recordedFees += fees;
      expectedFromConfig += await rpcExpectedFee(supabase, gatewayName, amount, "transfer");
      continue;
    }

    if (!LEDGER_FEE_TYPES.includes(txType as (typeof LEDGER_FEE_TYPES)[number])) continue;
    if (fees <= 0 && amount <= 0) continue;

    chargeCount += 1;
    recordedFees += fees;
    expectedFromConfig += await rpcExpectedFee(
      supabase,
      gatewayName,
      amount,
      feeScopeForLedgerType(txType),
    );
  }

  return {
    recorded_fees: Math.round(recordedFees * 100) / 100,
    expected_fees_from_config: Math.round(expectedFromConfig * 100) / 100,
    charge_count: chargeCount,
    payout_transfer_count: payoutTransferCount,
  };
}

/**
 * Suggest expected vs ledger-recorded gateway fees for a gateway + date range.
 *
 * When tenantId is set, uses finance_transactions (tenant-scoped ledger truth).
 * Otherwise uses payment_transactions + platform payout rows (legacy platform-wide).
 */
export async function computeGatewayFeeSuggestions(
  supabase: SupabaseClient,
  gatewayName: string,
  startDate: string,
  endDate: string,
  options: ComputeGatewayFeeSuggestionsOptions = {},
): Promise<FeeAutoComputeResult> {
  const gateway = normalizeGatewayName(gatewayName);
  if (!gateway) {
    throw new Error("gateway is required");
  }

  const { startIso, endIso } = feeReconciliationDateBounds(startDate, endDate);
  const tenantId = options.tenantId?.trim() || null;

  if (tenantId) {
    return computeFromFinanceLedger(supabase, gateway, startIso, endIso, tenantId);
  }

  const { data: chargeRows, error: chargeErr } = await supabase
    .from("payment_transactions")
    .select("amount, fees")
    .eq("provider", gateway)
    .in("status", [...CHARGE_STATUSES])
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  if (chargeErr) throw chargeErr;

  let recordedFees = 0;
  let expectedFromConfig = 0;
  const charges = chargeRows ?? [];

  for (const row of charges) {
    const amount = Math.abs(Number((row as { amount?: number }).amount ?? 0));
    const fees = Math.abs(Number((row as { fees?: number }).fees ?? 0));
    recordedFees += fees;
    expectedFromConfig += await rpcExpectedFee(supabase, gateway, amount, "transaction");
  }

  let payoutTransferCount = 0;

  if (gateway === "paystack") {
    const { data: payoutRows, error: payoutErr } = await supabase
      .from("finance_transactions")
      .select("amount, fees")
      .eq("transaction_type", "payout")
      .gte("created_at", startIso)
      .lte("created_at", endIso);

    if (payoutErr) throw payoutErr;

    for (const row of payoutRows ?? []) {
      const transferFee = Math.abs(Number((row as { fees?: number }).fees ?? 0));
      if (transferFee <= 0) continue;
      payoutTransferCount += 1;
      recordedFees += transferFee;
      const amount = Math.abs(Number((row as { amount?: number }).amount ?? 0));
      expectedFromConfig += await rpcExpectedFee(supabase, gateway, amount, "transfer");
    }
  }

  return {
    recorded_fees: Math.round(recordedFees * 100) / 100,
    expected_fees_from_config: Math.round(expectedFromConfig * 100) / 100,
    charge_count: charges.length,
    payout_transfer_count: payoutTransferCount,
  };
}
