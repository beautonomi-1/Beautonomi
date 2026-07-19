import { getStripeClient } from "@/lib/payments/stripe-server";
import type {
  PaymentInitParams,
  PaymentInitResult,
  PaymentProvider,
  PaymentRefundParams,
  PaymentRefundResult,
  VerifiedWebhookEvent,
} from "./types";
import { resolveSettlementModel } from "./settlement-model";

export const stripeProvider: PaymentProvider = {
  id: "stripe",
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
    const stripe = await getStripeClient(params.tenantId);
    const settlement = params.settlementModel ?? "connected_mor_destination";

    if (settlement === "separate_charges_transfers" || settlement === "platform_mor_transfer") {
      throw new Error(
        `Stripe settlement model "${settlement}" is not implemented yet. Configure connected_mor_destination for this region.`,
      );
    }

    const intentParams: Record<string, unknown> = {
      amount: params.amountInSmallestUnit,
      currency: params.currency.toLowerCase(),
      metadata: {
        ...(params.metadata ?? {}),
        reference: params.reference,
      },
      receipt_email: params.email,
    };

    if (settlement === "connected_mor_destination" && params.connectedAccountId) {
      intentParams.on_behalf_of = params.connectedAccountId;
      intentParams.transfer_data = { destination: params.connectedAccountId };
    } else if (settlement === "connected_mor_destination" && !params.connectedAccountId) {
      throw new Error(
        "Stripe Connect account required for destination charges in this region. Complete payout onboarding first.",
      );
    }

    // Hosted Checkout Session for mobile/web redirect flows (parity with Paystack authorization_url).
    if (params.callbackUrl) {
      const cancelUrl =
        typeof params.metadata?.cancel_action === "string"
          ? params.metadata.cancel_action
          : params.callbackUrl;
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          success_url: params.callbackUrl,
          cancel_url: cancelUrl,
          customer_email: params.email,
          client_reference_id: params.reference,
          metadata: {
            reference: params.reference,
            ...(params.metadata ?? {}),
          },
          payment_intent_data: {
            metadata: {
              reference: params.reference,
              ...(params.metadata ?? {}),
            },
            ...(settlement === "connected_mor_destination" && params.connectedAccountId
              ? {
                  on_behalf_of: params.connectedAccountId,
                  transfer_data: { destination: params.connectedAccountId },
                }
              : {}),
          },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: params.currency.toLowerCase(),
                unit_amount: params.amountInSmallestUnit,
                product_data: { name: "Beautonomi booking payment" },
              },
            },
          ],
        },
        { idempotencyKey: `checkout:${params.reference}` },
      );

      return {
        provider: "stripe",
        reference: params.reference,
        authorizationUrl: session.url ?? undefined,
        paymentIntentId:
          typeof session.payment_intent === "string" ? session.payment_intent : undefined,
      };
    }

    const intent = await stripe.paymentIntents.create(intentParams as any, {
      idempotencyKey: params.reference,
    });

    return {
      provider: "stripe",
      reference: params.reference,
      clientSecret: intent.client_secret ?? undefined,
      paymentIntentId: intent.id,
    };
  },
  async verifyPayment(reference, tenantId) {
    const stripe = await getStripeClient(tenantId);
    const intents = await stripe.paymentIntents.search({
      query: `metadata['reference']:'${reference}'`,
      limit: 1,
    });
    const intent = intents.data[0];
    return { paid: intent?.status === "succeeded", raw: intent };
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
