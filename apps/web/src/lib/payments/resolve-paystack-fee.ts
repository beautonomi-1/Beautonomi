import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolvedPaystackFee = {
  feesMajor: number;
  feeSource: "paystack" | "estimated";
};

/**
 * Resolve Paystack gateway fee for ledger posting.
 * When Paystack omits fees on charge.success, estimate from fee config.
 */
export async function resolvePaystackFeeMajor(
  supabase: SupabaseClient,
  params: {
    feesSmallestOrMajor: number;
    amountMajor: number;
    /** When true, input is already in major currency (ZAR). */
    alreadyMajor?: boolean;
    gateway?: string;
    feeScope?: "transaction" | "transfer" | "payout";
    asOfDate?: string | null;
  },
): Promise<ResolvedPaystackFee> {
  const gateway = (params.gateway ?? "paystack").trim().toLowerCase();
  const feeScope = params.feeScope ?? "transaction";
  const raw = Number(params.feesSmallestOrMajor ?? 0);
  const amountMajor = Math.abs(Number(params.amountMajor ?? 0));

  let feesMajor = params.alreadyMajor ? Math.abs(raw) : Math.abs(raw) / 100;
  if (feesMajor > 0.0001) {
    return { feesMajor: Math.round(feesMajor * 100) / 100, feeSource: "paystack" };
  }

  if (amountMajor <= 0) {
    return { feesMajor: 0, feeSource: "paystack" };
  }

  const rpcArgs: Record<string, unknown> = {
    gateway_name_param: gateway,
    transaction_amount: amountMajor,
    currency_param: "ZAR",
    payment_method_param: "*",
    region_param: "local",
    fee_scope_param: feeScope,
  };
  if (params.asOfDate) {
    rpcArgs.as_of_date_param = params.asOfDate;
  }

  const { data, error } = await supabase.rpc("calculate_expected_fee", rpcArgs);
  if (error) {
    console.warn("[resolvePaystackFeeMajor] calculate_expected_fee failed:", error.message);
    return { feesMajor: 0, feeSource: "paystack" };
  }

  feesMajor = Math.round(Number(data ?? 0) * 100) / 100;
  if (feesMajor <= 0) {
    return { feesMajor: 0, feeSource: "paystack" };
  }

  return { feesMajor, feeSource: "estimated" };
}
