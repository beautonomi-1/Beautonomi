import {
  initializePaystackTransaction,
  initializePaystackTransactionWithPlan,
  type PaystackInitParams,
  type PaystackInitSubscriptionParams,
} from "@/lib/payments/paystack-server";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { getStripeSecretKey } from "@/lib/payments/stripe-server";
import {
  getOnlinePaymentCheckoutByReference,
  markOnlinePaymentCheckoutStatus,
  upsertOnlinePaymentCheckout,
  type OnlineCheckoutProvider,
} from "@/lib/payments/online-payment-checkouts";
import {
  getPaymentProviderForTenant,
  getPaymentProviderById,
} from "@/lib/payments/provider/registry";
import { resolveSettlementModel } from "@/lib/payments/provider/settlement-model";
import type { PaymentInitParams, PaymentInitResult } from "@/lib/payments/provider/types";
import { getStripeClient } from "@/lib/payments/stripe-server";

export type OnlinePaymentInitInput = {
  tenantId: string | null | undefined;
  email: string;
  amountInSmallestUnit: number;
  currency: string;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
  channels?: string[];
  lineItemName?: string;
  saveCard?: boolean;
  stripeCustomerId?: string;
  mode?: "payment" | "setup";
};

export type OnlinePaymentInitOutput = PaymentInitResult & {
  provider: OnlineCheckoutProvider;
};

export async function isOnlineCardEnabledForTenant(
  tenantId: string | null | undefined,
): Promise<boolean> {
  if (!tenantId) return false;
  const psp = await getPaymentProviderForTenant(tenantId);
  if (!psp) return false;
  const gw = psp.provider.id.toLowerCase();
  if (gw === "paystack") {
    return isFeatureEnabledServer(FEATURE_FLAG_KEYS.PAYMENT_PAYSTACK, tenantId);
  }
  if (gw === "stripe") {
    try {
      await getStripeSecretKey({ tenantId });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function initializeOnlinePayment(
  input: OnlinePaymentInitInput,
): Promise<OnlinePaymentInitOutput> {
  const psp = await getPaymentProviderForTenant(input.tenantId);
  if (!psp) {
    throw new Error("Online card payment is currently unavailable");
  }
  const providerId = psp.provider.id.toLowerCase() as OnlineCheckoutProvider;

  if (providerId === "paystack") {
    const enabled = await isFeatureEnabledServer(FEATURE_FLAG_KEYS.PAYMENT_PAYSTACK, input.tenantId);
    if (!enabled) {
      throw new Error("Online card payment is currently unavailable");
    }
    const paystackData = await initializePaystackTransaction({
      email: input.email,
      amountInSmallestUnit: input.amountInSmallestUnit,
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata as PaystackInitParams["metadata"],
      channels: input.channels,
      tenantId: input.tenantId,
    });
    await upsertOnlinePaymentCheckout({
      reference: paystackData.data.reference,
      provider: "paystack",
      tenantId: input.tenantId,
      metadata: input.metadata ?? {},
    });
    return {
      provider: "paystack",
      reference: paystackData.data.reference,
      authorizationUrl: paystackData.data.authorization_url,
      accessCode: paystackData.data.access_code,
    };
  }

  const settlementModel = resolveSettlementModel(psp.gateway.config);
  const initParams: PaymentInitParams = {
    email: input.email,
    amountInSmallestUnit: input.amountInSmallestUnit,
    currency: input.currency,
    reference: input.reference,
    callbackUrl: input.callbackUrl,
    metadata: input.metadata,
    tenantId: input.tenantId,
    settlementModel,
    lineItemName: input.lineItemName,
    saveCard: input.saveCard,
    stripeCustomerId: input.stripeCustomerId,
    mode: input.mode ?? "payment",
  };
  const stripeInit = await psp.provider.initializePayment(initParams);
  await upsertOnlinePaymentCheckout({
    reference: input.reference,
    provider: "stripe",
    tenantId: input.tenantId,
    checkoutSessionId: stripeInit.checkoutSessionId ?? null,
    paymentIntentId: stripeInit.paymentIntentId ?? null,
    metadata: input.metadata ?? {},
  });
  return { ...stripeInit, provider: "stripe" };
}

/** Paystack subscription plan initializer — Paystack regions only. */
export async function initializeOnlinePaymentWithPlan(params: {
  tenantId: string | null | undefined;
  email: string;
  plan: string;
  callbackUrl: string;
  reference?: string;
  metadata?: Record<string, unknown>;
  currency?: string;
}) {
  const psp = await getPaymentProviderForTenant(params.tenantId);
  if (psp?.provider.id !== "paystack") {
    throw new Error("Plan-based subscription init is only available on Paystack regions");
  }
  const data = await initializePaystackTransactionWithPlan({
    email: params.email,
    plan: params.plan,
    callback_url: params.callbackUrl,
    reference: params.reference,
    metadata: params.metadata as PaystackInitSubscriptionParams["metadata"],
    currency: params.currency,
    tenantId: params.tenantId,
  });
  const ref = data.data.reference;
  await upsertOnlinePaymentCheckout({
    reference: ref,
    provider: "paystack",
    tenantId: params.tenantId,
    metadata: params.metadata ?? {},
  });
  return data;
}

export async function verifyOnlinePayment(
  reference: string,
  tenantId?: string | null,
): Promise<{ paid: boolean; provider: OnlineCheckoutProvider | null; raw?: unknown }> {
  const row = await getOnlinePaymentCheckoutByReference(reference);
  const provider = row?.provider ?? null;
  const tid = tenantId ?? row?.tenant_id ?? null;

  if (row?.status === "paid") {
    return { paid: true, provider, raw: row };
  }

  if (provider === "stripe") {
    const stripe = await getStripeClient(tid);
    if (row?.checkout_session_id) {
      const session = await stripe.checkout.sessions.retrieve(row.checkout_session_id, {
        expand: ["payment_intent.latest_charge.balance_transaction"],
      });
      const paid =
        session.payment_status === "paid" ||
        (session.mode === "setup" && session.status === "complete");
      if (paid) await markOnlinePaymentCheckoutStatus(reference, "paid");
      return { paid, provider: "stripe", raw: session };
    }
    if (row?.payment_intent_id) {
      const intent = await stripe.paymentIntents.retrieve(row.payment_intent_id, {
        expand: ["latest_charge.balance_transaction"],
      });
      const paid = intent.status === "succeeded";
      if (paid) await markOnlinePaymentCheckoutStatus(reference, "paid");
      return { paid, provider: "stripe", raw: intent };
    }
    return { paid: false, provider: "stripe", raw: null };
  }

  if (provider === "paystack" || !provider) {
    const psp = getPaymentProviderById("paystack");
    if (!psp) return { paid: false, provider: "paystack", raw: null };
    const result = await psp.verifyPayment(reference, tid);
    if (result.paid) await markOnlinePaymentCheckoutStatus(reference, "paid");
    return { paid: result.paid, provider: "paystack", raw: result.raw };
  }

  return { paid: false, provider, raw: null };
}

export async function refundOnlinePayment(params: {
  reference: string;
  tenantId?: string | null;
  providerPaymentId: string;
  amountInSmallestUnit?: number;
  currency: string;
  reason?: string;
  idempotencyKey?: string;
}): Promise<{ provider: string; refundId: string; status: string }> {
  const row = await getOnlinePaymentCheckoutByReference(params.reference);
  const tid = params.tenantId ?? row?.tenant_id ?? null;
  const provider = row?.provider ?? "paystack";
  const psp = getPaymentProviderById(provider);
  if (!psp) throw new Error("Unknown payment provider for refund");
  return psp.refund({
    providerPaymentId: params.providerPaymentId,
    amountInSmallestUnit: params.amountInSmallestUnit,
    currency: params.currency,
    reason: params.reason,
    tenantId: tid,
    idempotencyKey: params.idempotencyKey,
  });
}
