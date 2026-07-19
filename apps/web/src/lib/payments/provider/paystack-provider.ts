import {
  initializePaystackTransaction,
  getPaystackSecretKey,
} from "@/lib/payments/paystack-server";
import type {
  PaymentInitParams,
  PaymentInitResult,
  PaymentProvider,
  PaymentRefundParams,
  PaymentRefundResult,
  SettlementModel,
  VerifiedWebhookEvent,
} from "./types";
import { resolveSettlementModel } from "./settlement-model";

async function paystackRefund(params: PaymentRefundParams): Promise<PaymentRefundResult> {
  const { getPaystackSecretKey } = await import("@/lib/payments/paystack-server");
  const secret = await getPaystackSecretKey({ tenantId: params.tenantId });
  const body: Record<string, unknown> = {
    transaction: params.providerPaymentId,
  };
  if (params.amountInSmallestUnit != null) {
    body.amount = params.amountInSmallestUnit;
  }
  const res = await fetch("https://api.paystack.co/refund", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { status?: boolean; data?: { id?: number; status?: string } };
  if (!res.ok || !json.status) {
    throw new Error("Paystack refund failed");
  }
  return {
    provider: "paystack",
    refundId: String(json.data?.id ?? ""),
    status: String(json.data?.status ?? "pending"),
  };
}

export const paystackProvider: PaymentProvider = {
  id: "paystack",
  capabilities: {
    supportsSavedCards: true,
    supportsSubscriptions: true,
    supportsNativeMobileSdk: true,
    supportsRefunds: true,
    supportsConnectPayouts: true,
  },
  settlementModel(config) {
    return resolveSettlementModel(config);
  },
  async initializePayment(params: PaymentInitParams): Promise<PaymentInitResult> {
    const data = await initializePaystackTransaction({
      email: params.email,
      amountInSmallestUnit: params.amountInSmallestUnit,
      currency: params.currency,
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata as Record<string, unknown>,
      tenantId: params.tenantId,
      ...(params.connectedAccountId ? { subaccount: params.connectedAccountId } : {}),
    });
    return {
      provider: "paystack",
      reference: data.data.reference,
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
    };
  },
  async verifyPayment(reference, tenantId) {
    const secret = await getPaystackSecretKey({ tenantId });
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const json = (await res.json()) as { data?: { status?: string } };
    return { paid: json.data?.status === "success", raw: json };
  },
  refund: paystackRefund,
  async verifyWebhook(payload, signature, tenantId) {
    const crypto = await import("crypto");
    const { getPaystackSecretKey } = await import("@/lib/payments/paystack-server");
    const secret = await getPaystackSecretKey({ tenantId: tenantId ?? null });
    const text = typeof payload === "string" ? payload : payload.toString("utf8");
    const hash = crypto.createHmac("sha512", secret).update(text).digest("hex");
    if (hash !== signature) {
      throw new Error("Invalid Paystack webhook signature");
    }
    const parsed = JSON.parse(text) as { event?: string; data?: { id?: number } };
    return {
      provider: "paystack",
      id: String(parsed.data?.id ?? ""),
      type: String(parsed.event ?? ""),
      raw: parsed,
    };
  },
};
