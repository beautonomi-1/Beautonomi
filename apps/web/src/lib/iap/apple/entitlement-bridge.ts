/**
 * Apple IAP entitlement bridge — maps verified transactions to domain state.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appleMillisToIso,
  applePriceToMajor,
  verifyAndParseAppleTransactionJws,
  type AppleRenewalInfoPayload,
  type AppleTransactionPayload,
} from "@/lib/iap/apple/jws";
import { computeAppleCommission, loadAppleIapConfig } from "@/lib/iap/apple/config";
import {
  loadAppleProductById,
  resolveAdsBudgetOrderForAppleProduct,
  resolveSubscriptionPlanForAppleProduct,
  type AppleAdsOrderResolution,
} from "@/lib/iap/apple/registry";
import { recordProviderSubscriptionPayment } from "@/lib/subscriptions/provider-subscription-payment";
import { recordAdsBudgetOrderPayment } from "@/lib/ads/ads-budget-order-payment";

export type ProcessAppleTransactionResult = {
  ok: boolean;
  transactionId: string;
  productId: string;
  kind: "subscription" | "consumable" | "unknown";
  providerId: string | null;
  error?: string;
};

/**
 * Unique index `uniq_apple_iap_original_subscription` only covers rows whose
 * type is exactly `Auto-Renewable Subscription`. Defaulting a missing Apple
 * `type` to Consumable would silently drop subscriptions out of that index.
 */
export function resolveAppleIapTransactionType(
  kind: ProcessAppleTransactionResult["kind"],
  appleType?: string | null,
): string {
  if (kind === "subscription") return "Auto-Renewable Subscription";
  if (kind === "consumable") return "Consumable";
  const trimmed = appleType?.trim();
  return trimmed || "Unknown";
}

async function upsertAppleTransactionRow(
  supabase: SupabaseClient,
  tx: AppleTransactionPayload,
  opts: {
    providerId: string | null;
    adsBudgetOrderId?: string | null;
    notificationUuid?: string | null;
    rawJws: string;
    attributionStatus: "bound" | "pending" | "failed";
    kind: ProcessAppleTransactionResult["kind"];
  },
): Promise<void> {
  const purchaseIso = appleMillisToIso(tx.purchaseDate) ?? new Date().toISOString();
  await supabase.from("apple_iap_transactions").upsert(
    {
      transaction_id: tx.transactionId,
      original_transaction_id: tx.originalTransactionId,
      provider_id: opts.providerId,
      product_id: tx.productId,
      transaction_type: resolveAppleIapTransactionType(opts.kind, tx.type),
      purchase_date: purchaseIso,
      expires_date: appleMillisToIso(tx.expiresDate),
      grace_period_expires_date: appleMillisToIso(tx.gracePeriodExpiresDate),
      revocation_date: appleMillisToIso(tx.revocationDate),
      revocation_reason:
        tx.revocationReason != null ? String(tx.revocationReason) : null,
      offer_type: tx.offerType != null ? String(tx.offerType) : null,
      offer_identifier: tx.offerIdentifier ?? null,
      in_app_ownership_type: tx.inAppOwnershipType ?? null,
      storefront: tx.storefront ?? null,
      environment: tx.environment ?? "Production",
      price_zar: applePriceToMajor(tx.price, tx.currency),
      currency: tx.currency ?? "ZAR",
      app_account_token: tx.appAccountToken ?? null,
      ads_budget_order_id: opts.adsBudgetOrderId ?? null,
      notification_uuid: opts.notificationUuid ?? null,
      raw_jws: opts.rawJws,
      attribution_status: opts.attributionStatus,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "transaction_id" },
  );
}

async function applySubscriptionEntitlement(
  supabase: SupabaseClient,
  params: {
    providerId: string;
    planId: string;
    billingPeriod: "monthly" | "yearly";
    tx: AppleTransactionPayload;
    grossMajor: number;
    commissionRate: number;
  },
): Promise<void> {
  const { providerId, planId, billingPeriod, tx, grossMajor, commissionRate } = params;
  const expiresIso = appleMillisToIso(tx.expiresDate);
  const graceIso = appleMillisToIso(tx.gracePeriodExpiresDate);
  const isRevoked = Boolean(tx.revocationDate);
  const nowIso = new Date().toISOString();

  const status = isRevoked
    ? "expired"
    : expiresIso && new Date(expiresIso) < new Date()
      ? "expired"
      : "active";

  await supabase.from("provider_subscriptions").upsert(
    {
      provider_id: providerId,
      plan_id: planId,
      status,
      billing_period: billingPeriod,
      auto_renew: !isRevoked,
      expires_at: expiresIso,
      billing_provider: "apple",
      apple_original_transaction_id: tx.originalTransactionId,
      apple_product_id: tx.productId,
      apple_environment: tx.environment ?? "Production",
      apple_auto_renew_status: !isRevoked,
      apple_grace_period_expires_at: graceIso,
      apple_offer_identifier: tx.offerIdentifier ?? null,
      started_at: appleMillisToIso(tx.purchaseDate) ?? nowIso,
      updated_at: nowIso,
      paystack_subscription_code: null,
      paystack_authorization_code: null,
      paystack_customer_code: null,
      paystack_sync_pending: false,
      paystack_sync_note: null,
    },
    { onConflict: "provider_id" },
  );

  if (isRevoked || status === "expired") return;

  const { commissionMajor, proceedsMajor } = computeAppleCommission(
    grossMajor,
    commissionRate,
  );

  await recordProviderSubscriptionPayment({
    supabase,
    reference: tx.transactionId,
    providerId,
    amountMajor: grossMajor,
    feesMajor: commissionMajor,
    planId,
    kind: "apple_iap_subscription",
    description: "Provider subscription (Apple In-App Purchase)",
    paymentProvider: "apple",
    paymentMetadata: {
      original_transaction_id: tx.originalTransactionId,
      product_id: tx.productId,
      proceeds_major: proceedsMajor,
      environment: tx.environment,
    },
  });
}

async function applyConsumableEntitlement(
  supabase: SupabaseClient,
  params: {
    providerId: string;
    orderId: string;
    tx: AppleTransactionPayload;
    grossMajor: number;
    commissionRate: number;
  },
): Promise<void> {
  const { providerId, orderId, tx, grossMajor, commissionRate } = params;
  const { commissionMajor } = computeAppleCommission(grossMajor, commissionRate);

  await supabase
    .from("ads_budget_orders")
    .update({
      payment_provider: "apple",
      apple_transaction_id: tx.transactionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  await recordAdsBudgetOrderPayment({
    supabase,
    orderId,
    reference: tx.transactionId,
    amountMajor: grossMajor,
    feesMajor: commissionMajor,
    providerIdHint: providerId,
    paymentProvider: "apple",
  });
}

async function resolveSubscriptionLineageProvider(
  supabase: SupabaseClient,
  originalTransactionId: string,
): Promise<string | null> {
  if (!originalTransactionId.trim()) return null;

  const { data: sub } = await supabase
    .from("provider_subscriptions")
    .select("provider_id")
    .eq("apple_original_transaction_id", originalTransactionId)
    .eq("billing_provider", "apple")
    .maybeSingle();
  const fromSub = (sub as { provider_id?: string } | null)?.provider_id?.trim();
  if (fromSub) return fromSub;

  const { data: txRow } = await supabase
    .from("apple_iap_transactions")
    .select("provider_id")
    .eq("original_transaction_id", originalTransactionId)
    .not("provider_id", "is", null)
    .limit(1)
    .maybeSingle();
  return (txRow as { provider_id?: string } | null)?.provider_id?.trim() || null;
}

export async function processAppleSignedTransaction(params: {
  supabase: SupabaseClient;
  signedTransaction: string;
  providerIdHint?: string | null;
  notificationUuid?: string | null;
}): Promise<ProcessAppleTransactionResult> {
  const { supabase, signedTransaction, providerIdHint, notificationUuid } = params;

  const config = await loadAppleIapConfig(supabase);
  const commissionRate = config?.commissionRate ?? 0.15;

  let tx: AppleTransactionPayload;
  try {
    tx = verifyAndParseAppleTransactionJws(signedTransaction, {
      expectedBundleId: config?.bundleId,
    });
  } catch (e) {
    return {
      ok: false,
      transactionId: "",
      productId: "",
      kind: "unknown",
      providerId: null,
      error: e instanceof Error ? e.message : "Invalid transaction JWS",
    };
  }

  const product = await loadAppleProductById(supabase, tx.productId);
  const kind = product?.kind ?? "unknown";
  const grossMajor =
    applePriceToMajor(tx.price, tx.currency) || product?.apple_price_zar || 0;

  /**
   * Bind the Apple subscription *lineage* (originalTransactionId) to one
   * business. Renewals mint a new transactionId, so checking only that id
   * would let a restore on a second Beautonomi account steal the plan.
   */
  const { data: existingRow } = await supabase
    .from("apple_iap_transactions")
    .select("provider_id")
    .eq("transaction_id", tx.transactionId)
    .maybeSingle();
  const boundProviderId =
    (existingRow as { provider_id?: string | null } | null)?.provider_id ?? null;
  const lineageProviderId =
    kind === "subscription"
      ? await resolveSubscriptionLineageProvider(supabase, tx.originalTransactionId)
      : null;
  const hintedProviderId = providerIdHint?.trim() || null;

  const conflictOwner = lineageProviderId ?? boundProviderId;
  if (conflictOwner && hintedProviderId && conflictOwner !== hintedProviderId) {
    return {
      ok: false,
      transactionId: tx.transactionId,
      productId: tx.productId,
      kind: kind === "unknown" ? "unknown" : kind,
      providerId: conflictOwner,
      error: "This Apple purchase is already applied to another business account.",
    };
  }

  let providerId = lineageProviderId ?? hintedProviderId ?? boundProviderId;
  let adsOrder: { orderId: string; providerId: string } | null = null;
  let adsOrderFailure: string | null = null;

  if (kind === "consumable") {
    const resolution: AppleAdsOrderResolution = await resolveAdsBudgetOrderForAppleProduct(
      supabase,
      tx.productId,
      tx.appAccountToken,
      { expectedProviderId: providerId, transactionId: tx.transactionId },
    );
    if (resolution.ok && resolution.orderId && resolution.providerId) {
      adsOrder = { orderId: resolution.orderId, providerId: resolution.providerId };
      providerId = providerId ?? resolution.providerId;
    } else {
      adsOrderFailure = resolution.reason ?? "Ads budget order could not be resolved";
    }
  } else if (!providerId && tx.appAccountToken?.trim()) {
    // Server notifications carry no session, so the token is the only link to a
    // business. Confirm it names a real provider before trusting it.
    const token = tx.appAccountToken.trim();
    const { data: providerRow } = await supabase
      .from("providers")
      .select("id")
      .eq("id", token)
      .maybeSingle();
    providerId = (providerRow as { id?: string } | null)?.id ?? null;
  }

  const adsOrderId = adsOrder?.orderId ?? null;
  const attributionStatus: "bound" | "pending" | "failed" = providerId ? "bound" : "pending";

  await upsertAppleTransactionRow(supabase, tx, {
    providerId,
    adsBudgetOrderId: adsOrderId,
    notificationUuid,
    rawJws: signedTransaction,
    attributionStatus,
    kind,
  });

  if (!providerId) {
    return {
      ok: false,
      transactionId: tx.transactionId,
      productId: tx.productId,
      kind: kind === "unknown" ? "unknown" : kind,
      providerId: null,
      error: "Transaction pending attribution — open the app signed in to your business account.",
    };
  }

  if (kind === "subscription") {
    const plan = await resolveSubscriptionPlanForAppleProduct(supabase, tx.productId);
    if (!plan) {
      return {
        ok: false,
        transactionId: tx.transactionId,
        productId: tx.productId,
        kind: "subscription",
        providerId,
        error: "Unknown subscription product",
      };
    }
    await applySubscriptionEntitlement(supabase, {
      providerId,
      planId: plan.planId,
      billingPeriod: plan.billingPeriod,
      tx,
      grossMajor,
      commissionRate,
    });
    return {
      ok: true,
      transactionId: tx.transactionId,
      productId: tx.productId,
      kind: "subscription",
      providerId,
    };
  }

  if (kind === "consumable") {
    if (!adsOrder) {
      return {
        ok: false,
        transactionId: tx.transactionId,
        productId: tx.productId,
        kind: "consumable",
        providerId,
        error: adsOrderFailure ?? "Missing ads budget order for consumable purchase",
      };
    }
    await applyConsumableEntitlement(supabase, {
      providerId,
      orderId: adsOrder.orderId,
      tx,
      grossMajor,
      commissionRate,
    });
    return {
      ok: true,
      transactionId: tx.transactionId,
      productId: tx.productId,
      kind: "consumable",
      providerId,
    };
  }

  return {
    ok: false,
    transactionId: tx.transactionId,
    productId: tx.productId,
    kind: "unknown",
    providerId,
    error: "Unmapped Apple product",
  };
}

/**
 * Applies an Apple renewal-info payload to the subscription row.
 *
 * Renewal info carries state that never appears on a transaction: the customer
 * turning auto-renew off, entry into billing retry, and the grace period window
 * that keeps features on for up to 16 days while Apple retries the card.
 */
export async function applyAppleRenewalInfo(params: {
  supabase: SupabaseClient;
  renewal: AppleRenewalInfoPayload;
  notificationType: string;
  subtype?: string;
}): Promise<void> {
  const { supabase, renewal, notificationType, subtype } = params;
  if (!renewal.originalTransactionId) return;

  const { data: sub } = await supabase
    .from("provider_subscriptions")
    .select("provider_id, status")
    .eq("apple_original_transaction_id", renewal.originalTransactionId)
    .eq("billing_provider", "apple")
    .maybeSingle();
  const row = sub as { provider_id: string; status: string } | null;
  if (!row) return;

  const graceIso = appleMillisToIso(renewal.gracePeriodExpiresDate);
  const autoRenew = renewal.autoRenewStatus == null ? null : renewal.autoRenewStatus === 1;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (autoRenew !== null) {
    update.apple_auto_renew_status = autoRenew;
    update.auto_renew = autoRenew;
  }
  if (graceIso) {
    update.apple_grace_period_expires_at = graceIso;
  }
  if (renewal.autoRenewProductId) {
    update.apple_renewal_product_id = renewal.autoRenewProductId;
  }
  if (renewal.offerIdentifier) {
    update.apple_offer_identifier = renewal.offerIdentifier;
  }
  if (renewal.priceIncreaseStatus === 1 || notificationType === "PRICE_INCREASE") {
    if (subtype === "ACCEPTED" || renewal.priceIncreaseStatus === 2) {
      update.apple_price_increase_status = "consented";
    } else if (subtype !== "ACCEPTED") {
      update.apple_price_increase_status = "pending";
    }
  }
  if (renewal.priceIncreaseStatus === 2) {
    update.apple_price_increase_status = "consented";
  }
  if (renewal.priceIncreaseStatus === 0 && notificationType !== "PRICE_INCREASE") {
    update.apple_price_increase_status = "none";
  }

  const inBillingRetry =
    renewal.isInBillingRetryPeriod === true ||
    notificationType === "DID_FAIL_TO_RENEW" ||
    subtype === "BILLING_RETRY";
  if (inBillingRetry && row.status === "active") {
    update.status = "past_due";
  }
  // Apple resolved the billing issue, so restore the entitlement immediately.
  if (notificationType === "DID_RENEW" && row.status === "past_due") {
    update.status = "active";
    update.apple_grace_period_expires_at = null;
  }

  await supabase
    .from("provider_subscriptions")
    .update(update)
    .eq("provider_id", row.provider_id);
}

export async function handleAppleSubscriptionExpired(
  supabase: SupabaseClient,
  originalTransactionId: string,
): Promise<void> {
  const { data: sub } = await supabase
    .from("provider_subscriptions")
    .select("provider_id")
    .eq("apple_original_transaction_id", originalTransactionId)
    .eq("billing_provider", "apple")
    .maybeSingle();
  if (!sub) return;

  const { resolveCatalogPlanIdForProviderSubscription } = await import(
    "@/lib/subscriptions/ensure-provider-free-subscription"
  );
  const freePlanId = await resolveCatalogPlanIdForProviderSubscription(supabase);

  await supabase
    .from("provider_subscriptions")
    .update({
      status: "expired",
      plan_id: freePlanId,
      auto_renew: false,
      apple_auto_renew_status: false,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_id", (sub as { provider_id: string }).provider_id);
}
