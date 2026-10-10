import { getStripeClient } from "@/lib/payments/stripe-server";

/**
 * Stripe Customer Portal for provider subscription (update card, view invoices).
 * Paystack regions use `/api/provider/subscription/manage-link` Paystack branch instead.
 */
export async function createProviderStripeBillingPortalUrl(input: {
  tenantId: string | null | undefined;
  stripeCustomerId: string;
  returnUrl: string;
}): Promise<string> {
  const customerId = input.stripeCustomerId.trim();
  if (!customerId) {
    throw new Error("Stripe customer id is required");
  }
  const returnUrl = input.returnUrl.trim();
  if (!returnUrl.startsWith("http")) {
    throw new Error("returnUrl must be an absolute HTTPS URL");
  }

  const stripe = await getStripeClient(input.tenantId ?? null);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  const url = session.url?.trim();
  if (!url) {
    throw new Error("Stripe did not return a billing portal URL");
  }
  return url;
}
