import { fromMinorUnits } from "@beautonomi/utils";
import {
  flutterwaveRequest,
  flutterwaveRefundAmountMajor,
  getFlutterwaveSecretKey,
  getFlutterwaveWebhookHash,
  verifyFlutterwaveTransactionById,
  verifyFlutterwaveWebhookHash,
} from "@/lib/payments/flutterwave-server";
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

export const flutterwaveProvider: PaymentProvider = {
  id: "flutterwave",
  capabilities: {
    supportsSavedCards: true,
    supportsSubscriptions: false,
    supportsNativeMobileSdk: false,
    supportsRefunds: true,
    supportsConnectPayouts: false,
  },
  settlementModel(config: Record<string, unknown>): SettlementModel {
    return resolveSettlementModel(config);
  },
  async initializePayment(params: PaymentInitParams): Promise<PaymentInitResult> {
    const amountMajor = fromMinorUnits(params.amountInSmallestUnit, params.currency);
    const res = await flutterwaveRequest<{
      link?: string;
      id?: number | string;
    }>(
      "POST",
      "/payments",
      {
        tx_ref: params.reference,
        amount: amountMajor,
        currency: params.currency.toUpperCase(),
        redirect_url: params.callbackUrl,
        customer: { email: params.email },
        meta: params.metadata ?? {},
      },
      params.tenantId,
    );
    const link = res.data?.link;
    if (!link?.trim()) {
      throw new Error("Flutterwave did not return checkout link");
    }
    const id = res.data?.id != null ? String(res.data.id) : undefined;
    return {
      provider: "flutterwave",
      reference: params.reference,
      authorizationUrl: link.trim(),
      paymentIntentId: id,
    };
  },
  async verifyPayment(reference, tenantId) {
    const ref = reference.trim();
    if (!ref) return { paid: false, raw: null };

    if (/^\d+$/.test(ref)) {
      const result = await verifyFlutterwaveTransactionById(ref, { tenantId });
      return { paid: result.ok, raw: result.ok ? result.tx : result };
    }

    const secret = await getFlutterwaveSecretKey({ tenantId });
    const res = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(ref)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const json = (await res.json()) as {
      status?: string;
      data?: { status?: string; id?: string | number };
    };
    const paid =
      res.ok &&
      json.status === "success" &&
      String(json.data?.status ?? "").toLowerCase() === "successful";
    return { paid, raw: json };
  },
  async refund(params: PaymentRefundParams): Promise<PaymentRefundResult> {
    const body: Record<string, unknown> = {};
    const amountMajor = flutterwaveRefundAmountMajor(
      params.amountInSmallestUnit,
      params.currency,
    );
    if (amountMajor != null) body.amount = amountMajor;

    const res = await flutterwaveRequest<{ id?: number | string; status?: string }>(
      "POST",
      `/transactions/${encodeURIComponent(params.providerPaymentId)}/refund`,
      body,
      params.tenantId,
    );
    return {
      provider: "flutterwave",
      refundId: String(res.data?.id ?? params.providerPaymentId),
      status: String(res.data?.status ?? "pending"),
    };
  },
  async verifyWebhook(payload, signature, tenantId) {
    const hash = await getFlutterwaveWebhookHash({ tenantId: tenantId ?? null });
    const text = typeof payload === "string" ? payload : payload.toString("utf8");
    if (hash) {
      if (!verifyFlutterwaveWebhookHash(signature, hash)) {
        throw new Error("Invalid Flutterwave webhook signature");
      }
    } else {
      const allowUnsignedDev =
        process.env.NODE_ENV !== "production" &&
        (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development");
      if (!allowUnsignedDev) {
        throw new Error("Flutterwave webhook hash not configured");
      }
    }
    const parsed = JSON.parse(text) as {
      event?: string;
      "event.type"?: string;
      data?: { id?: number | string; tx_ref?: string };
    };
    const eventType = String(parsed.event ?? parsed["event.type"] ?? "");
    const data = parsed.data ?? {};
    return {
      provider: "flutterwave",
      id: String(data.id ?? data.tx_ref ?? ""),
      type: eventType || "charge.completed",
      raw: parsed,
    };
  },
};
