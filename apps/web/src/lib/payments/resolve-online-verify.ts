import { getOnlinePaymentCheckoutByReference } from "@/lib/payments/online-payment-checkouts";
import { verifyOnlinePayment } from "@/lib/payments/online-payment";
import { getPaystackSecretKey } from "@/lib/payments/paystack-server";
import { settleStripeCheckoutSession } from "@/lib/payments/settle-stripe-online-payment";
import { getStripeClient } from "@/lib/payments/stripe-server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type OnlineVerifyContext = {
  reference: string;
  tenantId: string | null;
  sessionId?: string | null;
};

/** Stripe return URLs include `session_id`; Paystack uses `reference` only — never treat stray session_id as Stripe when checkout is Paystack. */
export function shouldUseStripeOnlineVerify(
  checkoutProvider: "paystack" | "stripe" | null | undefined,
  sessionId: string | null | undefined,
): boolean {
  if (checkoutProvider === "stripe") return true;
  if (checkoutProvider === "paystack") return false;
  return Boolean(sessionId?.trim());
}

/** Stripe docs: fulfill using Session `client_reference_id` / metadata.reference — must match caller reference. */
export function stripeCheckoutSessionMatchesReference(
  session: {
    client_reference_id?: string | null;
    metadata?: Record<string, string> | null;
  },
  reference: string,
): boolean {
  const expected = reference.trim();
  if (!expected) return false;
  const clientRef =
    typeof session.client_reference_id === "string" ? session.client_reference_id.trim() : "";
  if (clientRef && clientRef === expected) return true;
  const metaRef =
    typeof session.metadata?.reference === "string" ? session.metadata.reference.trim() : "";
  return Boolean(metaRef && metaRef === expected);
}

/**
 * Gateway-aware verify used by `/api/paystack/verify*` (name kept for client compatibility).
 * Resolves provider from `online_payment_checkouts` before calling Paystack or Stripe.
 */
export async function verifyAndSettleOnlinePayment(
  ctx: OnlineVerifyContext,
  supabase: SupabaseClient,
): Promise<{
  paid: boolean;
  provider: "paystack" | "stripe" | null;
  paystackVerifyJson?: unknown;
}> {
  const { reference, tenantId, sessionId } = ctx;
  const row = await getOnlinePaymentCheckoutByReference(reference);
  const provider = row?.provider ?? null;

  if (shouldUseStripeOnlineVerify(provider, sessionId)) {
    const stripe = await getStripeClient(tenantId ?? row?.tenant_id ?? null);
    if (sessionId?.trim()) {
      const session = await stripe.checkout.sessions.retrieve(sessionId.trim(), {
        expand: ["payment_intent.latest_charge.balance_transaction"],
      });
      if (!stripeCheckoutSessionMatchesReference(session, reference)) {
        return { paid: false, provider: "stripe", paystackVerifyJson: session };
      }
      const setupComplete = session.mode === "setup" && session.status === "complete";
      const paymentPaid = session.payment_status === "paid";
      if (paymentPaid || setupComplete) {
        await settleStripeCheckoutSession(session, supabase);
        return { paid: true, provider: "stripe", paystackVerifyJson: session };
      }
      return { paid: false, provider: "stripe", paystackVerifyJson: session };
    }

    const verified = await verifyOnlinePayment(reference, tenantId ?? row?.tenant_id);
    if (verified.paid && verified.raw) {
      if (verified.provider === "stripe") {
        const raw = verified.raw as { object?: string; payment_status?: string };
        if (raw && typeof raw === "object" && "payment_status" in raw) {
          await settleStripeCheckoutSession(raw as Parameters<typeof settleStripeCheckoutSession>[0], supabase);
        } else {
          const { settleStripePaymentIntentSucceeded } = await import(
            "@/lib/payments/settle-stripe-online-payment"
          );
          await settleStripePaymentIntentSucceeded(
            verified.raw as Parameters<typeof settleStripePaymentIntentSucceeded>[0],
            supabase,
          );
        }
      }
    }
    return {
      paid: verified.paid,
      provider: verified.provider,
      paystackVerifyJson: verified.raw,
    };
  }

  const PAYSTACK_SECRET_KEY = await getPaystackSecretKey({ tenantId });
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("Paystack secret key not configured");
  }

  const paystackResponse = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    },
  );

  if (!paystackResponse.ok) {
    throw new Error("Failed to verify payment");
  }

  const data = await paystackResponse.json();
  const paid = data?.data?.status === "success";
  return { paid, provider: "paystack", paystackVerifyJson: data };
}
