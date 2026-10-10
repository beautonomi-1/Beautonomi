import { getStripeClient } from "@/lib/payments/stripe-server";
import { stringifyStripeMetadata } from "@/lib/payments/provider/stripe-metadata";
import type {
  PaymentInitParams,
  PaymentInitResult,
  PaymentProvider,
  PaymentRefundParams,
  PaymentRefundResult,
  VerifiedWebhookEvent,
} from "./types";
import { resolveSettlementModel } from "./settlement-model";

function appendCheckoutSessionPlaceholder(successUrl: string): string {
  const sep = successUrl.includes("?") ? "&" : "?";
  if (successUrl.includes("{CHECKOUT_SESSION_ID}")) return successUrl;
  return `${successUrl}${sep}session_id={CHECKOUT_SESSION_ID}`;
}

export const stripeProvider: PaymentProvider = {
  id: "stripe",
  capabilities: {
    supportsSavedCards: true,
    supportsSubscriptions: true,
    supportsNativeMobileSdk: false,
    supportsRefunds: true,
    supportsConnectPayouts: true,
  },
  settlementModel(config) {
    return resolveSettlementModel(config);
  },
  async initializePayment(params: PaymentInitParams): Promise<PaymentInitResult> {
    const stripe = await getStripeClient(params.tenantId);
    const settlement = params.settlementModel ?? "platform_mor_transfer";

    if (settlement === "connected_mor_destination" || settlement === "separate_charges_transfers") {
      throw new Error(
        `Stripe settlement model "${settlement}" is not supported for customer checkout. Use platform_mor_transfer.`,
      );
    }

    const meta = stringifyStripeMetadata({
      ...(params.metadata ?? {}),
      reference: params.reference,
      ...(params.tenantId ? { tenant_id: params.tenantId } : {}),
    });

    const mode = params.mode ?? "payment";
    const lineName = params.lineItemName?.trim() || "Beautonomi payment";

    if (params.callbackUrl) {
      const cancelUrl =
        typeof params.metadata?.cancel_action === "string"
          ? String(params.metadata.cancel_action)
          : params.callbackUrl;
      const successUrl = appendCheckoutSessionPlaceholder(params.callbackUrl);

      const sessionParams: Record<string, unknown> = {
        mode,
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: params.reference,
        metadata: meta,
        payment_method_types: ["card"],
      };

      if (params.stripeCustomerId?.trim()) {
        sessionParams.customer = params.stripeCustomerId.trim();
      } else if (params.email?.trim()) {
        sessionParams.customer_email = params.email.trim();
      }

      if (mode === "payment") {
        sessionParams.line_items = [
          {
            quantity: 1,
            price_data: {
              currency: params.currency.toLowerCase(),
              unit_amount: params.amountInSmallestUnit,
              product_data: { name: lineName },
            },
          },
        ];
        sessionParams.payment_intent_data = {
          metadata: meta,
          ...(params.saveCard ? { setup_future_usage: "off_session" as const } : {}),
        };
      } else if (mode === "setup") {
        sessionParams.currency = params.currency.toLowerCase();
      }

      const session = await stripe.checkout.sessions.create(sessionParams as any, {
        idempotencyKey: `checkout:${params.reference}`,
      });

      const pi =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent && typeof session.payment_intent === "object"
            ? (session.payment_intent as { id?: string }).id
            : undefined;

      return {
        provider: "stripe",
        reference: params.reference,
        authorizationUrl: session.url ?? undefined,
        checkoutSessionId: session.id,
        paymentIntentId: pi,
      };
    }

    const intent = await stripe.paymentIntents.create(
      {
        amount: params.amountInSmallestUnit,
        currency: params.currency.toLowerCase(),
        metadata: meta,
        receipt_email: params.email,
        ...(params.stripeCustomerId ? { customer: params.stripeCustomerId } : {}),
        ...(params.saveCard ? { setup_future_usage: "off_session" as const } : {}),
      },
      { idempotencyKey: params.reference },
    );

    return {
      provider: "stripe",
      reference: params.reference,
      clientSecret: intent.client_secret ?? undefined,
      paymentIntentId: intent.id,
    };
  },
  async verifyPayment(reference, tenantId) {
    const { getOnlinePaymentCheckoutByReference } = await import(
      "@/lib/payments/online-payment-checkouts"
    );
    const row = await getOnlinePaymentCheckoutByReference(reference);
    const stripe = await getStripeClient(tenantId ?? row?.tenant_id ?? null);
    if (row?.checkout_session_id) {
      const session = await stripe.checkout.sessions.retrieve(row.checkout_session_id, {
        expand: ["payment_intent"],
      });
      const paid =
        session.payment_status === "paid" ||
        (session.mode === "setup" && session.status === "complete");
      return { paid, raw: session };
    }
    if (row?.payment_intent_id) {
      const intent = await stripe.paymentIntents.retrieve(row.payment_intent_id);
      return { paid: intent.status === "succeeded", raw: intent };
    }
    return { paid: false, raw: null };
  },
  async refund(params: PaymentRefundParams): Promise<PaymentRefundResult> {
    const stripe = await getStripeClient(params.tenantId);
    const refund = await stripe.refunds.create(
      {
        payment_intent: params.providerPaymentId,
        ...(params.amountInSmallestUnit != null ? { amount: params.amountInSmallestUnit } : {}),
        reason: params.reason === "fraudulent" ? "fraudulent" : "requested_by_customer",
      },
      params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
    );
    return {
      provider: "stripe",
      refundId: refund.id,
      status: refund.status ?? "pending",
    };
  },
  async verifyWebhook(payload, signature, tenantId): Promise<VerifiedWebhookEvent> {
    const Stripe = (await import("stripe")).default;
    const { getStripeWebhookSecret } = await import("@/lib/payments/stripe-server");
    const secret = await getStripeWebhookSecret({ tenantId });
    const text = typeof payload === "string" ? payload : payload.toString("utf8");
    const event = Stripe.webhooks.constructEvent(text, signature, secret);
    return {
      provider: "stripe",
      id: event.id,
      type: event.type,
      raw: event,
    };
  },
};
