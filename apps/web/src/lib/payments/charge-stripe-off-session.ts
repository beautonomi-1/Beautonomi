import { getStripeClient } from "@/lib/payments/stripe-server";
import { upsertOnlinePaymentCheckout } from "@/lib/payments/online-payment-checkouts";
import { stringifyStripeMetadata } from "@/lib/payments/provider/stripe-metadata";

export type ChargeStripeOffSessionResult =
  | { ok: true; paymentIntentId: string; reference: string }
  | { ok: false; pending: true; paymentIntentId?: string; reference: string; message: string }
  | { ok: false; pending?: false; message: string };

/** A saved-card charge that has not been declined and has not finished. */
export function stripeOffSessionStillOpen(status: string | null | undefined): boolean {
  const value = String(status ?? "").toLowerCase();
  return (
    value === "processing" ||
    value === "requires_action" ||
    value === "requires_capture" ||
    value === "requires_confirmation"
  );
}

/**
 * Charge a saved Stripe payment method (pm_*) off-session for a known platform reference.
 */
export async function chargeStripeOffSession(params: {
  tenantId: string | null | undefined;
  reference: string;
  email: string;
  amountInSmallestUnit: number;
  currency: string;
  stripePaymentMethodId: string;
  metadata: Record<string, unknown>;
}): Promise<ChargeStripeOffSessionResult> {
  const pmId = params.stripePaymentMethodId.trim();
  if (!pmId.startsWith("pm_")) {
    return { ok: false, message: "Invalid Stripe payment method" };
  }

  try {
    await upsertOnlinePaymentCheckout({
      reference: params.reference,
      provider: "stripe",
      tenantId: params.tenantId ?? null,
      metadata: params.metadata,
    });

    const stripe = await getStripeClient(params.tenantId ?? null);
    const pm = await stripe.paymentMethods.retrieve(pmId);
    const customerId =
      typeof pm.customer === "string"
        ? pm.customer
        : pm.customer && typeof pm.customer === "object"
          ? pm.customer.id
          : null;
    if (!customerId) {
      return { ok: false, message: "Saved card is not linked to a Stripe customer" };
    }

    const meta = stringifyStripeMetadata({
      reference: params.reference,
      ...params.metadata,
    });

    const intent = await stripe.paymentIntents.create(
      {
        amount: params.amountInSmallestUnit,
        currency: params.currency.toLowerCase(),
        customer: customerId,
        payment_method: pmId,
        confirm: true,
        off_session: true,
        receipt_email: params.email,
        metadata: meta,
      },
      { idempotencyKey: params.reference },
    );

    await upsertOnlinePaymentCheckout({
      reference: params.reference,
      provider: "stripe",
      tenantId: params.tenantId ?? null,
      paymentIntentId: intent.id,
      metadata: params.metadata,
    });

    if (intent.status === "succeeded") {
      return { ok: true, paymentIntentId: intent.id, reference: params.reference };
    }
    if (stripeOffSessionStillOpen(intent.status)) {
      return {
        ok: false,
        pending: true,
        paymentIntentId: intent.id,
        reference: params.reference,
        message: `Payment status: ${intent.status}`,
      };
    }
    return { ok: false, message: `Payment status: ${intent.status}` };
  } catch (err) {
    const intent = (err as { payment_intent?: { id?: string; status?: string } } | null)?.payment_intent;
    const code = (err as { code?: string } | null)?.code;
    const message = err instanceof Error ? err.message : "Stripe charge failed";
    if (stripeOffSessionStillOpen(intent?.status) || code === "authentication_required") {
      return {
        ok: false,
        pending: true,
        paymentIntentId: intent?.id,
        reference: params.reference,
        message,
      };
    }
    return { ok: false, message };
  }
}
