/**
 * GET /api/cron/process-stripe-subscription-renewals
 *
 * Off-session Stripe renewals for provider platform subscriptions (billing_provider = stripe).
 */
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { generateTransactionReference } from "@/lib/payments/paystack";
import { convertToSmallestUnit } from "@/lib/payments/paystack";
import { getStripeClient } from "@/lib/payments/stripe-server";
import { upsertOnlinePaymentCheckout } from "@/lib/payments/online-payment-checkouts";
import { recordProviderSubscriptionPayment } from "@/lib/subscriptions/provider-subscription-payment";
import { computePaidPeriodExpiresAt } from "@/lib/subscriptions/provider-billing-merchant";

const JOB_NAME = "process-stripe-subscription-renewals";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return new Response(auth.error || "Unauthorized", { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob());
}

async function runJob() {
  try {
    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    const { data: rows, error } = await supabase
      .from("provider_subscriptions")
      .select(
        "id, provider_id, plan_id, billing_period, expires_at, stripe_customer_id, stripe_payment_method_id, providers:provider_id ( tenant_id )",
      )
      .eq("billing_provider", "stripe")
      .eq("status", "active")
      .eq("auto_renew", true)
      .not("stripe_payment_method_id", "is", null)
      .lte("expires_at", nowIso);

    if (error) throw error;

    let renewed = 0;
    let failed = 0;

    for (const sub of rows ?? []) {
      const row = sub as {
        id: string;
        provider_id: string;
        plan_id: string;
        billing_period?: string | null;
        stripe_customer_id?: string | null;
        stripe_payment_method_id?: string | null;
        providers?: { tenant_id?: string | null } | Array<{ tenant_id?: string | null }>;
      };

      const pm = row.stripe_payment_method_id?.trim();
      const cus = row.stripe_customer_id?.trim();
      if (!pm || !cus) continue;

      const prov = Array.isArray(row.providers) ? row.providers[0] : row.providers;
      const tenantId = prov?.tenant_id ?? null;

      const { data: planRow } = await supabase
        .from("subscription_plans")
        .select("price_monthly, price_yearly, currency, name")
        .eq("id", row.plan_id)
        .maybeSingle();
      const plan = planRow as {
        price_monthly?: number | null;
        price_yearly?: number | null;
        currency?: string | null;
        name?: string | null;
      } | null;

      const isYearly = row.billing_period === "yearly";
      const amountMajor = Number(isYearly ? plan?.price_yearly : plan?.price_monthly) || 0;
      if (amountMajor <= 0) continue;

      const currency = (plan?.currency || "ZAR").toUpperCase();
      const reference = generateTransactionReference("sub_stripe_renew", row.id);

      try {
        await upsertOnlinePaymentCheckout({
          reference,
          provider: "stripe",
          tenantId,
          metadata: {
            provider_id: row.provider_id,
            plan_id: row.plan_id,
            kind: "subscription_renewal",
            tenant_id: tenantId ?? "",
          },
        });

        const stripe = await getStripeClient(tenantId);
        const intent = await stripe.paymentIntents.create(
          {
            amount: convertToSmallestUnit(amountMajor, currency),
            currency: currency.toLowerCase(),
            customer: cus,
            payment_method: pm,
            confirm: true,
            off_session: true,
            metadata: {
              reference,
              provider_id: row.provider_id,
              plan_id: row.plan_id,
              kind: "subscription_renewal",
              tenant_id: tenantId ?? "",
            },
          },
          { idempotencyKey: reference },
        );

        if (intent.status !== "succeeded") {
          throw new Error(`PaymentIntent status ${intent.status}`);
        }

        await recordProviderSubscriptionPayment({
          supabase,
          providerId: row.provider_id,
          planId: row.plan_id,
          reference,
          amountMajor,
          feesMajor: 0,
          kind: "subscription_renewal",
          billingPeriod: isYearly ? "yearly" : "monthly",
          description: `Stripe subscription renewal — ${plan?.name ?? "plan"}`,
          paymentProvider: "stripe",
          tenantIdHint: tenantId,
        });

        await supabase
          .from("provider_subscriptions")
          .update({
            expires_at: computePaidPeriodExpiresAt(isYearly ? "yearly" : "monthly"),
            status: "active",
            updated_at: nowIso,
          })
          .eq("id", row.id);

        renewed++;
      } catch (err) {
        failed++;
        await supabase
          .from("provider_subscriptions")
          .update({ status: "past_due", updated_at: nowIso })
          .eq("id", row.id);
        console.warn("[process-stripe-subscription-renewals] failed:", row.id, err);
      }
    }

    return successResponse({ renewed, failed });
  } catch (error) {
    return handleApiError(error, "Cron: process-stripe-subscription-renewals failed");
  }
}
