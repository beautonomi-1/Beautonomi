/**
 * Load Apple IAP product registry from DB with static fallback.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { STATIC_APPLE_CATALOG } from "@/lib/iap/apple/product-catalog";

export type AppleIapProductRow = {
  product_id: string;
  kind: "subscription" | "consumable";
  ref_table: string;
  ref_id: string | null;
  ref_key: string | null;
  apple_price_zar: number;
  apple_price_point: number | null;
  subscription_group_level: number | null;
  reference_name: string;
  display_name: string;
  description: string;
  is_active: boolean;
};

export async function loadAppleProductById(
  supabase: SupabaseClient,
  productId: string,
): Promise<AppleIapProductRow | null> {
  const { data } = await supabase
    .from("apple_iap_products")
    .select("*")
    .eq("product_id", productId)
    .eq("is_active", true)
    .maybeSingle();
  if (data) return data as AppleIapProductRow;

  const staticRow = STATIC_APPLE_CATALOG.find((r) => r.productId === productId);
  if (!staticRow) return null;
  return {
    product_id: staticRow.productId,
    kind: staticRow.ascType === "Consumable" ? "consumable" : "subscription",
    ref_table: staticRow.refTable,
    ref_id: null,
    ref_key: staticRow.refKey,
    apple_price_zar: staticRow.targetApplePriceZar,
    apple_price_point: null,
    subscription_group_level: staticRow.groupLevel ?? null,
    reference_name: staticRow.referenceName,
    display_name: staticRow.displayName,
    description: staticRow.description,
    is_active: true,
  };
}

export async function resolveSubscriptionPlanForAppleProduct(
  supabase: SupabaseClient,
  productId: string,
): Promise<{ planId: string; billingPeriod: "monthly" | "yearly" } | null> {
  const { data: byMonthly } = await supabase
    .from("subscription_plans")
    .select("id, slug")
    .eq("apple_product_id_monthly", productId)
    .eq("is_active", true)
    .maybeSingle();
  if (byMonthly) {
    return { planId: (byMonthly as { id: string }).id, billingPeriod: "monthly" };
  }

  const { data: byYearly } = await supabase
    .from("subscription_plans")
    .select("id, slug")
    .eq("apple_product_id_yearly", productId)
    .eq("is_active", true)
    .maybeSingle();
  if (byYearly) {
    return { planId: (byYearly as { id: string }).id, billingPeriod: "yearly" };
  }

  // Parse product id: com.beautonomi.partner.sub.{slug}.{period}
  const m = productId.match(/^com\.beautonomi\.partner\.sub\.([^.]+)\.(monthly|yearly)$/);
  if (!m) return null;
  const slug = `beautonomi-${m[1]}`;
  const billingPeriod = m[2] as "monthly" | "yearly";
  const { data: plan } = await supabase
    .from("subscription_plans")
    .select("id")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (!plan) return null;
  return { planId: (plan as { id: string }).id, billingPeriod };
}

/**
 * Flat rather than a discriminated union on purpose: this app compiles with
 * `strictNullChecks: false`, where narrowing a `ok: true | false` discriminant
 * does not work, so callers must read `ok` and the payload fields directly.
 */
export type AppleAdsOrderResolution = {
  ok: boolean;
  reason: string | null;
  orderId: string | null;
  campaignId: string | null;
  providerId: string | null;
  amountMajor: number;
  alreadyFunded: boolean;
};

function adsOrderRejected(reason: string): AppleAdsOrderResolution {
  return {
    ok: false,
    reason,
    orderId: null,
    campaignId: null,
    providerId: null,
    amountMajor: 0,
    alreadyFunded: false,
  };
}

const PACK_TABLES = new Set(["ads_impression_packs", "ads_time_packs"]);

/**
 * Resolves the pending ads budget order a consumable purchase should fund.
 *
 * The client chooses both the StoreKit product and the appAccountToken, so the
 * order is only accepted when it belongs to the purchasing provider, is still
 * awaiting Apple payment, and its amount matches the pack behind the purchased
 * product. Without those checks a caller could fund an expensive order with a
 * cheap SKU or pay into another provider's order.
 */
export async function resolveAdsBudgetOrderForAppleProduct(
  supabase: SupabaseClient,
  productId: string,
  appAccountToken: string | null | undefined,
  options: { expectedProviderId?: string | null; transactionId?: string | null } = {},
): Promise<AppleAdsOrderResolution> {
  const orderId = appAccountToken?.trim();
  if (!orderId) {
    return adsOrderRejected("Purchase is missing the ads order reference (appAccountToken)");
  }

  const { data } = await supabase
    .from("ads_budget_orders")
    .select("id, campaign_id, provider_id, status, amount, payment_provider, apple_transaction_id")
    .eq("id", orderId)
    .maybeSingle();
  const order = data as
    | {
        id: string;
        campaign_id: string | null;
        provider_id: string;
        status: string;
        amount: number | string | null;
        payment_provider: string | null;
        apple_transaction_id: string | null;
      }
    | null;
  if (!order) {
    return adsOrderRejected("Ads budget order not found for this purchase");
  }

  const expectedProviderId = options.expectedProviderId?.trim();
  if (expectedProviderId && order.provider_id !== expectedProviderId) {
    return adsOrderRejected("Ads budget order belongs to a different business");
  }

  if (order.payment_provider && order.payment_provider !== "apple") {
    return adsOrderRejected("Ads budget order is not an Apple in-app purchase order");
  }

  const transactionId = options.transactionId?.trim() || null;
  const alreadyFunded = order.status === "paid";
  if (alreadyFunded) {
    // Re-delivery of the same transaction is idempotent; a different
    // transaction must not pay into an order that is already settled.
    if (!transactionId || order.apple_transaction_id !== transactionId) {
      return adsOrderRejected("Ads budget order has already been paid");
    }
  } else if (order.status !== "pending") {
    return adsOrderRejected(`Ads budget order is ${order.status} and cannot be funded`);
  } else if (order.apple_transaction_id && order.apple_transaction_id !== transactionId) {
    return adsOrderRejected("Ads budget order is bound to a different Apple transaction");
  }

  const amountMajor = Number(order.amount ?? 0);
  const product = await loadAppleProductById(supabase, productId);
  if (!product || product.kind !== "consumable") {
    return adsOrderRejected("Purchased product is not an ads pack");
  }

  if (PACK_TABLES.has(product.ref_table) && product.ref_id) {
    const { data: packRow } = await supabase
      .from(product.ref_table)
      .select("price_zar")
      .eq("id", product.ref_id)
      .maybeSingle();
    const packPrice = Number((packRow as { price_zar?: number | string } | null)?.price_zar ?? NaN);
    if (Number.isFinite(packPrice) && Math.abs(packPrice - amountMajor) > 0.01) {
      return adsOrderRejected(
        "Purchased pack does not match the amount on the ads budget order",
      );
    }
  }

  return {
    ok: true,
    reason: null,
    orderId: order.id,
    campaignId: order.campaign_id,
    providerId: order.provider_id,
    amountMajor,
    alreadyFunded,
  };
}
