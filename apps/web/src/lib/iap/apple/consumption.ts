/**
 * App Store consumption information for CONSUMPTION_REQUEST.
 *
 * Apple is the merchant of record: Beautonomi cannot refund an App Store charge.
 * This payload is the factual signal Apple uses to grant or decline a customer
 * refund. Zeros read as "undeclared / unused" and bias Apple toward a grant.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getFxRate } from "@/lib/fx/get-fx-rate";
import { loadAppleProductById } from "@/lib/iap/apple/registry";

/** Apple AccountTenure. */
export const ACCOUNT_TENURE = {
  UNDECLARED: 0,
  ZERO_TO_THREE_DAYS: 1,
  THREE_TO_TEN_DAYS: 2,
  TEN_TO_THIRTY_DAYS: 3,
  THIRTY_TO_NINETY_DAYS: 4,
  NINETY_TO_HUNDRED_EIGHTY_DAYS: 5,
  HUNDRED_EIGHTY_TO_YEAR: 6,
  OVER_YEAR: 7,
} as const;

/** Apple LifetimeDollarsPurchased / Refunded. Values are USD. */
export const LIFETIME_DOLLARS = {
  UNDECLARED: 0,
  ZERO: 1,
  UP_TO_50: 2,
  UP_TO_100: 3,
  UP_TO_500: 4,
  UP_TO_1000: 5,
  UP_TO_2000: 6,
  OVER_2000: 7,
} as const;

export const CONSUMPTION_STATUS = {
  UNDECLARED: 0,
  NOT_CONSUMED: 1,
  PARTIALLY_CONSUMED: 2,
  FULLY_CONSUMED: 3,
} as const;

export const DELIVERY_STATUS = {
  DELIVERED: 0,
  QUALITY_ISSUE: 1,
  WRONG_ITEM: 2,
  SERVER_OUTAGE: 3,
  NOT_CONSUMED: 4,
  OTHER: 5,
} as const;

export const REFUND_PREFERENCE = {
  UNDECLARED: 0,
  GRANT: 1,
  DECLINE: 2,
  NO_PREFERENCE: 3,
} as const;

export const USER_STATUS = {
  UNDECLARED: 0,
  ACTIVE: 1,
  SUSPENDED: 2,
  TERMINATED: 3,
  LIMITED_ACCESS: 4,
} as const;

export type AppleConsumptionInformation = {
  accountTenure: number;
  appAccountToken?: string;
  consumptionStatus: number;
  customerConsented: true;
  deliveryStatus: number;
  lifetimeDollarsPurchased: number;
  lifetimeDollarsRefunded: number;
  platform: 1;
  playTime: 0;
  sampleContentProvided: false;
  userStatus: number;
  refundPreference: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Apple rejects the whole consumption PUT if appAccountToken is not a UUID. */
export function appleAppAccountTokenOrOmit(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !UUID_RE.test(trimmed)) return undefined;
  return trimmed.toLowerCase();
}

export function undeclaredAppleConsumption(opts?: {
  appAccountToken?: string | null;
  refundPreference?: number;
}): AppleConsumptionInformation {
  const token = appleAppAccountTokenOrOmit(opts?.appAccountToken);
  return {
    accountTenure: ACCOUNT_TENURE.UNDECLARED,
    ...(token ? { appAccountToken: token } : {}),
    consumptionStatus: CONSUMPTION_STATUS.UNDECLARED,
    customerConsented: true,
    deliveryStatus: DELIVERY_STATUS.DELIVERED,
    lifetimeDollarsPurchased: LIFETIME_DOLLARS.UNDECLARED,
    lifetimeDollarsRefunded: LIFETIME_DOLLARS.UNDECLARED,
    platform: 1,
    playTime: 0,
    sampleContentProvided: false,
    userStatus: USER_STATUS.UNDECLARED,
    refundPreference: opts?.refundPreference ?? REFUND_PREFERENCE.NO_PREFERENCE,
  };
}

export function appleAccountTenureBucket(createdAt: Date, now: Date = new Date()): number {
  const days = (now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
  if (!Number.isFinite(days) || days < 0) return ACCOUNT_TENURE.UNDECLARED;
  if (days < 3) return ACCOUNT_TENURE.ZERO_TO_THREE_DAYS;
  if (days < 10) return ACCOUNT_TENURE.THREE_TO_TEN_DAYS;
  if (days < 30) return ACCOUNT_TENURE.TEN_TO_THIRTY_DAYS;
  if (days < 90) return ACCOUNT_TENURE.THIRTY_TO_NINETY_DAYS;
  if (days < 180) return ACCOUNT_TENURE.NINETY_TO_HUNDRED_EIGHTY_DAYS;
  if (days < 365) return ACCOUNT_TENURE.HUNDRED_EIGHTY_TO_YEAR;
  return ACCOUNT_TENURE.OVER_YEAR;
}

export function appleLifetimeDollarsBucket(usd: number): number {
  if (!Number.isFinite(usd) || usd < 0) return LIFETIME_DOLLARS.UNDECLARED;
  if (usd === 0) return LIFETIME_DOLLARS.ZERO;
  if (usd < 50) return LIFETIME_DOLLARS.UP_TO_50;
  if (usd < 100) return LIFETIME_DOLLARS.UP_TO_100;
  if (usd < 500) return LIFETIME_DOLLARS.UP_TO_500;
  if (usd < 1000) return LIFETIME_DOLLARS.UP_TO_1000;
  if (usd < 2000) return LIFETIME_DOLLARS.UP_TO_2000;
  return LIFETIME_DOLLARS.OVER_2000;
}

export function adsPackConsumption(spent: number, amount: number): {
  consumptionStatus: number;
  deliveryStatus: number;
  refundPreference: number;
} {
  const budget = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const used = Number.isFinite(spent) && spent > 0 ? spent : 0;
  if (budget <= 0 || used <= 0) {
    return {
      consumptionStatus: CONSUMPTION_STATUS.NOT_CONSUMED,
      deliveryStatus: DELIVERY_STATUS.DELIVERED,
      refundPreference: REFUND_PREFERENCE.GRANT,
    };
  }
  const ratio = used / budget;
  if (ratio >= 0.9) {
    return {
      consumptionStatus: CONSUMPTION_STATUS.FULLY_CONSUMED,
      deliveryStatus: DELIVERY_STATUS.DELIVERED,
      refundPreference: REFUND_PREFERENCE.DECLINE,
    };
  }
  return {
    consumptionStatus: CONSUMPTION_STATUS.PARTIALLY_CONSUMED,
    deliveryStatus: DELIVERY_STATUS.DELIVERED,
    refundPreference: ratio >= 0.2 ? REFUND_PREFERENCE.DECLINE : REFUND_PREFERENCE.GRANT,
  };
}

export function subscriptionPeriodConsumption(
  purchaseAt: Date,
  expiresAt: Date | null,
  now: Date = new Date(),
): {
  consumptionStatus: number;
  deliveryStatus: number;
  refundPreference: number;
} {
  const start = purchaseAt.getTime();
  const end = expiresAt?.getTime() ?? start + 30 * 24 * 60 * 60 * 1000;
  const elapsed = now.getTime() - start;
  const period = Math.max(end - start, 1);
  if (!Number.isFinite(elapsed) || elapsed <= 0) {
    return {
      consumptionStatus: CONSUMPTION_STATUS.NOT_CONSUMED,
      deliveryStatus: DELIVERY_STATUS.DELIVERED,
      refundPreference: REFUND_PREFERENCE.GRANT,
    };
  }
  const ratio = elapsed / period;
  if (ratio >= 0.9) {
    return {
      consumptionStatus: CONSUMPTION_STATUS.FULLY_CONSUMED,
      deliveryStatus: DELIVERY_STATUS.DELIVERED,
      refundPreference: REFUND_PREFERENCE.DECLINE,
    };
  }
  if (ratio < 0.1) {
    return {
      consumptionStatus: CONSUMPTION_STATUS.NOT_CONSUMED,
      deliveryStatus: DELIVERY_STATUS.DELIVERED,
      refundPreference: REFUND_PREFERENCE.GRANT,
    };
  }
  return {
    consumptionStatus: CONSUMPTION_STATUS.PARTIALLY_CONSUMED,
    deliveryStatus: DELIVERY_STATUS.DELIVERED,
    refundPreference: REFUND_PREFERENCE.DECLINE,
  };
}

function providerUserStatus(status: string | null | undefined): number {
  const s = (status ?? "").toLowerCase();
  if (s === "suspended") return USER_STATUS.SUSPENDED;
  if (s === "deleted" || s === "terminated") return USER_STATUS.TERMINATED;
  if (s === "draft" || s === "pending_approval") return USER_STATUS.LIMITED_ACCESS;
  if (s === "active") return USER_STATUS.ACTIVE;
  return USER_STATUS.UNDECLARED;
}

/**
 * Convert stored Apple transaction majors to USD. `price_zar` is misnamed —
 * it is the Apple milli-unit converted to major units of `currency`.
 */
export async function appleStoredAmountsToUsd(
  rows: Array<{ amount: number; currency?: string | null }>,
): Promise<number | null> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const currency = (row.currency || "ZAR").toUpperCase();
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  if (totals.size === 0) return 0;

  let usd = 0;
  for (const [currency, amount] of totals) {
    if (currency === "USD") {
      usd += amount;
      continue;
    }
    const fx = await getFxRate({ base: currency, quote: "USD" });
    if (fx == null || !Number.isFinite(fx) || fx <= 0) return null;
    usd += amount * fx;
  }
  return Math.round(usd * 100) / 100;
}

async function sumAppleSpendUsd(
  supabase: SupabaseClient,
  providerId: string,
  revokedOnly: boolean,
): Promise<number | null> {
  let query = supabase
    .from("apple_iap_transactions")
    .select("price_zar, currency, revocation_date")
    .eq("provider_id", providerId);
  if (revokedOnly) {
    query = query.not("revocation_date", "is", null);
  }
  const { data } = await query;
  const rows = (data ?? []) as Array<{
    price_zar?: number | string | null;
    currency?: string | null;
  }>;
  return appleStoredAmountsToUsd(
    rows.map((row) => ({ amount: Number(row.price_zar ?? 0), currency: row.currency })),
  );
}

/**
 * Builds the CONSUMPTION_REQUEST body from live ads spend or subscription
 * elapsed time. `refundPreferenceOverride` is for support responding to an
 * outstanding Apple refund request — it does not itself refund the charge.
 */
export async function buildAppleConsumptionInformation(params: {
  supabase: SupabaseClient;
  transactionId: string;
  refundPreferenceOverride?: number;
}): Promise<AppleConsumptionInformation> {
  const { supabase, transactionId, refundPreferenceOverride } = params;
  const { data: txRow } = await supabase
    .from("apple_iap_transactions")
    .select(
      "transaction_id, provider_id, product_id, purchase_date, expires_date, app_account_token, ads_budget_order_id, revocation_date",
    )
    .eq("transaction_id", transactionId)
    .maybeSingle();
  const tx = txRow as {
    transaction_id: string;
    provider_id?: string | null;
    product_id: string;
    purchase_date?: string | null;
    expires_date?: string | null;
    app_account_token?: string | null;
    ads_budget_order_id?: string | null;
    revocation_date?: string | null;
  } | null;
  if (!tx) {
    return undeclaredAppleConsumption({ refundPreference: refundPreferenceOverride });
  }
  if (!tx.provider_id) {
    return undeclaredAppleConsumption({
      appAccountToken: tx.app_account_token,
      refundPreference: refundPreferenceOverride,
    });
  }

  const providerId = tx.provider_id;
  const { data: providerRow } = await supabase
    .from("providers")
    .select("created_at, status")
    .eq("id", providerId)
    .maybeSingle();
  const provider = providerRow as { created_at?: string | null; status?: string | null } | null;

  const product = await loadAppleProductById(supabase, tx.product_id);
  let consumption: {
    consumptionStatus: number;
    deliveryStatus: number;
    refundPreference: number;
  } = {
    consumptionStatus: CONSUMPTION_STATUS.UNDECLARED,
    deliveryStatus: DELIVERY_STATUS.DELIVERED,
    refundPreference: REFUND_PREFERENCE.NO_PREFERENCE,
  };

  if (product?.kind === "consumable") {
    let orderId = tx.ads_budget_order_id ?? null;
    if (!orderId) {
      const { data: orderByTx } = await supabase
        .from("ads_budget_orders")
        .select("id")
        .eq("apple_transaction_id", transactionId)
        .maybeSingle();
      orderId = (orderByTx as { id?: string } | null)?.id ?? null;
    }
    if (orderId) {
      const { data: orderRow } = await supabase
        .from("ads_budget_orders")
        .select("id, amount, campaign_id, status")
        .eq("id", orderId)
        .maybeSingle();
      const order = orderRow as {
        amount?: number | string | null;
        campaign_id?: string | null;
        status?: string | null;
      } | null;
      const amount = Number(order?.amount ?? 0);
      let spent = 0;
      if (order?.campaign_id) {
        const { data: campaign } = await supabase
          .from("ads_campaigns")
          .select("spent")
          .eq("id", order.campaign_id)
          .maybeSingle();
        spent = Number((campaign as { spent?: number | string | null } | null)?.spent ?? 0);
      }
      if (order?.status === "refunded") {
        consumption = {
          consumptionStatus: CONSUMPTION_STATUS.NOT_CONSUMED,
          deliveryStatus: DELIVERY_STATUS.DELIVERED,
          refundPreference: REFUND_PREFERENCE.GRANT,
        };
      } else {
        consumption = adsPackConsumption(spent, amount);
      }
    } else {
      consumption = {
        consumptionStatus: CONSUMPTION_STATUS.NOT_CONSUMED,
        deliveryStatus: DELIVERY_STATUS.DELIVERED,
        refundPreference: REFUND_PREFERENCE.GRANT,
      };
    }
  } else {
    consumption = subscriptionPeriodConsumption(
      tx.purchase_date ? new Date(tx.purchase_date) : new Date(),
      tx.expires_date ? new Date(tx.expires_date) : null,
    );
  }

  const purchasedUsd = await sumAppleSpendUsd(supabase, providerId, false);
  const refundedUsd = await sumAppleSpendUsd(supabase, providerId, true);

  const preference =
    refundPreferenceOverride === REFUND_PREFERENCE.GRANT ||
    refundPreferenceOverride === REFUND_PREFERENCE.DECLINE ||
    refundPreferenceOverride === REFUND_PREFERENCE.NO_PREFERENCE
      ? refundPreferenceOverride
      : consumption.refundPreference;

  const token = appleAppAccountTokenOrOmit(tx.app_account_token);
  return {
    accountTenure: provider?.created_at
      ? appleAccountTenureBucket(new Date(provider.created_at))
      : ACCOUNT_TENURE.UNDECLARED,
    ...(token ? { appAccountToken: token } : {}),
    consumptionStatus: consumption.consumptionStatus,
    customerConsented: true,
    deliveryStatus: consumption.deliveryStatus,
    lifetimeDollarsPurchased:
      purchasedUsd == null ? LIFETIME_DOLLARS.UNDECLARED : appleLifetimeDollarsBucket(purchasedUsd),
    lifetimeDollarsRefunded:
      refundedUsd == null ? LIFETIME_DOLLARS.UNDECLARED : appleLifetimeDollarsBucket(refundedUsd),
    platform: 1,
    playTime: 0,
    sampleContentProvided: false,
    userStatus: providerUserStatus(provider?.status),
    refundPreference: preference,
  };
}
