import type { SupabaseClient } from "@supabase/supabase-js";
import { LEDGER_FEE_TYPES } from "@/lib/admin/fee-reconciliation-compute";

const PAYSTACK_CARD_TYPES = new Set<string>([...LEDGER_FEE_TYPES, "payout"]);

const NON_GATEWAY_PROVIDERS = new Set(["wallet", "gift_card", "cash", "eft", "manual"]);

export type GatewayFeeCaptureAnomalies = {
  row_count: number;
  expected_fees_total: number;
};

/**
 * Count Paystack-attributed ledger rows with fees <= 0 that should carry a gateway fee.
 */
export async function countGatewayFeeCaptureAnomalies(
  supabase: SupabaseClient,
  tenantId: string,
  range: { start?: string | null; end?: string | null },
): Promise<GatewayFeeCaptureAnomalies> {
  let q = supabase
    .from("finance_transactions")
    .select("id, amount, fees, transaction_type, source_payment_id")
    .eq("tenant_id", tenantId)
    .lte("fees", 0);

  if (range.start) q = q.gte("created_at", range.start);
  if (range.end) q = q.lte("created_at", range.end);

  const { data: rows, error } = await q;
  if (error) {
    console.warn("countGatewayFeeCaptureAnomalies:", error.message);
    return { row_count: 0, expected_fees_total: 0 };
  }

  const sourceIds = [
    ...new Set(
      (rows ?? [])
        .map((r) => (r as { source_payment_id?: string }).source_payment_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const sourceGateway = new Map<string, string>();
  if (sourceIds.length > 0) {
    const { data: bp } = await supabase
      .from("booking_payments")
      .select("id, payment_provider")
      .eq("tenant_id", tenantId)
      .in("id", sourceIds);
    for (const row of bp ?? []) {
      const id = String((row as { id?: string }).id ?? "");
      const provider = String((row as { payment_provider?: string }).payment_provider ?? "");
      if (id && provider) sourceGateway.set(id, provider.toLowerCase());
    }
  }

  let rowCount = 0;
  let expectedTotal = 0;

  for (const row of rows ?? []) {
    const txType = String((row as { transaction_type?: string }).transaction_type ?? "");
    if (!PAYSTACK_CARD_TYPES.has(txType)) continue;

    const amount = Math.abs(Number((row as { amount?: number }).amount ?? 0));
    if (amount <= 0 && txType !== "payout") continue;

    let gateway: string | null = null;
    if (txType === "payout") {
      gateway = "paystack";
    } else if (
      [
        "provider_subscription_payment",
        "provider_ads_payment",
        "provider_marketing_credit_topup",
        "gift_card_sale",
        "wallet_topup",
        "membership_sale",
        "terminal_sale",
        "terminal_rental",
        "terminal_bundle_alloc",
        "terminal_promotion",
      ].includes(txType)
    ) {
      gateway = "paystack";
    } else {
      const spId = (row as { source_payment_id?: string }).source_payment_id;
      if (spId) gateway = sourceGateway.get(spId) ?? null;
    }

    if (!gateway || NON_GATEWAY_PROVIDERS.has(gateway)) continue;
    if (gateway !== "paystack" && gateway !== "yoco") continue;

    const feeScope = txType === "payout" ? "transfer" : "transaction";
    const { data: expected } = await supabase.rpc("calculate_expected_fee", {
      gateway_name_param: gateway,
      transaction_amount: amount,
      currency_param: "ZAR",
      payment_method_param: "*",
      region_param: "local",
      fee_scope_param: feeScope,
    });

    const est = Number(expected ?? 0);
    if (est <= 0) continue;

    rowCount += 1;
    expectedTotal += est;
  }

  return {
    row_count: rowCount,
    expected_fees_total: Math.round(expectedTotal * 100) / 100,
  };
}
