import type { SupabaseClient } from "@supabase/supabase-js";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";

export type GatewayFeeSource =
  | "paystack"
  | "estimated"
  | "stripe"
  | "stripe_fee_missing";

export type ResolvedGatewayFees = {
  feesMajor: number;
  feeSource: GatewayFeeSource;
};

/** Paystack charge.success fee resolution (channel + currency aware). */
export async function resolvePaystackGatewayFees(
  supabase: SupabaseClient,
  params: {
    feesSmallestOrMajor: number;
    amountMajor: number;
    currency: string;
    channel?: string | null;
    alreadyMajor?: boolean;
  },
): Promise<ResolvedGatewayFees> {
  const currency = (params.currency || "ZAR").trim().toUpperCase();
  const channel = (params.channel ?? "*").trim().toLowerCase() || "*";
  const raw = Number(params.feesSmallestOrMajor ?? 0);
  let feesMajor = params.alreadyMajor ? Math.abs(raw) : Math.abs(raw) / 100;
  feesMajor = Math.round(feesMajor * 100) / 100;

  if (feesMajor > 0.0001) {
    return { feesMajor, feeSource: "paystack" };
  }

  if (params.amountMajor <= 0) {
    return { feesMajor: 0, feeSource: "paystack" };
  }

  const { data, error } = await supabase.rpc("calculate_expected_fee", {
    gateway_name_param: "paystack",
    transaction_amount: params.amountMajor,
    currency_param: currency,
    payment_method_param: channel,
    region_param: "local",
    fee_scope_param: "transaction",
  });
  if (error) {
    console.warn("[resolvePaystackGatewayFees] calculate_expected_fee failed:", error.message);
    return { feesMajor: 0, feeSource: "paystack" };
  }

  const estimated = Math.round(Number(data ?? 0) * 100) / 100;
  if (estimated <= 0) {
    return { feesMajor: 0, feeSource: "paystack" };
  }
  return { feesMajor: estimated, feeSource: "estimated" };
}

/** Stripe: use PSP fee in major units; never Paystack estimate. */
export function resolveStripeGatewayFees(params: {
  feeMinor: number;
  currency: string;
}): ResolvedGatewayFees {
  const factor = 100;
  const feesMajor = Math.round((Math.max(0, params.feeMinor) / factor) * 100) / 100;
  if (feesMajor > 0) {
    return { feesMajor, feeSource: "stripe" };
  }
  return { feesMajor: 0, feeSource: "stripe_fee_missing" };
}

export async function resolveGatewayFeesForCharge(
  supabase: SupabaseClient,
  provider: "paystack" | "stripe",
  params: {
    amountMajor: number;
    feesSmallestOrMajor?: number;
    currency: string;
    channel?: string | null;
    stripeFeeMinor?: number;
    alreadyMajor?: boolean;
  },
): Promise<ResolvedGatewayFees> {
  if (provider === "stripe") {
    return resolveStripeGatewayFees({
      feeMinor: params.stripeFeeMinor ?? 0,
      currency: params.currency,
    });
  }
  return resolvePaystackGatewayFees(supabase, {
    feesSmallestOrMajor: params.feesSmallestOrMajor ?? 0,
    amountMajor: params.amountMajor,
    currency: params.currency,
    channel: params.channel,
    alreadyMajor: params.alreadyMajor,
  });
}

export async function resolveOnlineChargeFees(
  supabase: SupabaseClient,
  paymentProvider: "paystack" | "stripe",
  params: {
    amountSmallest?: number;
    feesSmallest?: number;
    currency: string;
    channel?: string | null;
  },
) {
  const amountInCurrency = convertFromSmallestUnit(params.amountSmallest || 0, params.currency);
  if (paymentProvider === "stripe") {
    const feeMinor = Number(params.feesSmallest ?? 0);
    const resolved = resolveStripeGatewayFees({ feeMinor, currency: params.currency });
    return {
      amountInCurrency,
      feesInCurrency: resolved.feesMajor,
      feeSource: resolved.feeSource,
      netAmount: amountInCurrency - resolved.feesMajor,
    };
  }
  const feesInCurrencyRaw = convertFromSmallestUnit(params.feesSmallest || 0, params.currency);
  const resolved = await resolvePaystackGatewayFees(supabase, {
    feesSmallestOrMajor: feesInCurrencyRaw,
    amountMajor: amountInCurrency,
    currency: params.currency,
    channel: params.channel,
    alreadyMajor: true,
  });
  return {
    amountInCurrency,
    feesInCurrency: resolved.feesMajor,
    feeSource: resolved.feeSource,
    netAmount: amountInCurrency - resolved.feesMajor,
  };
}
