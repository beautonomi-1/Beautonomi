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
import { resolveStripeGatewayFees } from "@/lib/payments/resolve-gateway-fees";
import { stripeOffSessionStillOpen } from "@/lib/payments/charge-stripe-off-session";
import { upsertOnlinePaymentCheckout, markOnlinePaymentCheckoutStatus } from "@/lib/payments/online-payment-checkouts";
import { recordProviderSubscriptionPayment } from "@/lib/subscriptions/provider-subscription-payment";
import {
  capturedRenewalAccess,
  computePaidPeriodExpiresAt,
} from "@/lib/subscriptions/provider-billing-merchant";
import { subscriptionPaymentFailedAccessNote } from "@/lib/iap/apple/billing-active";
import { sendTemplateNotification } from "@/lib/notifications/onesignal";

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
        "id, provider_id, plan_id, billing_period, expires_at, stripe_customer_id, stripe_payment_method_id, providers:provider_id ( tenant_id, user_id, business_name )",
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
        expires_at?: string | null;
        stripe_customer_id?: string | null;
        stripe_payment_method_id?: string | null;
        providers?:
          | { tenant_id?: string | null; user_id?: string | null; business_name?: string | null }
          | Array<{ tenant_id?: string | null; user_id?: string | null; business_name?: string | null }>;
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
      const { data: inflight, error: inflightError } = await supabase
        .from("online_payment_checkouts")
        .select("reference, metadata, updated_at")
        .eq("provider", "stripe")
        .eq("status", "pending")
        .contains("metadata", { provider_id: row.provider_id, kind: "subscription_renewal" })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!inflightError && inflight) {
        const inflightMeta =
          inflight.metadata && typeof inflight.metadata === "object" && !Array.isArray(inflight.metadata)
            ? (inflight.metadata as Record<string, unknown>)
            : {};
        if (inflightMeta.charge_captured === true && inflight.reference) {
          const billingPeriod = isYearly ? "yearly" : "monthly";
          const chargedAt = String((inflight as { updated_at?: string }).updated_at ?? "");
          const capturedAccess = capturedRenewalAccess({
            billingPeriod,
            chargedAt,
            currentExpiresAt: row.expires_at,
            currentPlanId: row.plan_id,
            currentBillingPeriod: row.billing_period,
            now: new Date(nowIso),
          });
          const periodEnd = capturedAccess?.expiresAt ?? null;
          const savedAmount = Number(inflightMeta.amount_major);
          const payment = await recordProviderSubscriptionPayment({
            supabase,
            providerId: row.provider_id,
            planId: row.plan_id,
            reference: String(inflight.reference),
            amountMajor: Number.isFinite(savedAmount) && savedAmount > 0 ? savedAmount : amountMajor,
            feesMajor: 0,
            kind: "subscription_renewal",
            billingPeriod,
            termEndsAt: periodEnd ?? (row.expires_at && Number.isFinite(Date.parse(row.expires_at))
              ? new Date(Date.parse(row.expires_at)).toISOString()
              : null),
            description: `Stripe subscription renewal — ${plan?.name ?? "plan"}`,
            paymentProvider: "stripe",
            tenantIdHint: tenantId,
            updateBillingPeriod: false,
          });
          if (payment.chargeReturned) continue;
          if (payment.recorded || payment.alreadyRecorded) {
            const periodStart = capturedAccess?.periodStart
              ?? (Number.isFinite(Date.parse(chargedAt))
                ? new Date(chargedAt).toISOString()
                : nowIso);
            const { data: opened, error: periodError } = await supabase
              .from("provider_subscriptions")
              .update({
                status: "active",
                past_due_since: null,
                updated_at: nowIso,
                ...(periodEnd
                  ? {
                      expires_at: periodEnd,
                      billing_period_start: periodStart,
                      billing_period_end: periodEnd,
                    }
                  : row.expires_at && Number.isFinite(Date.parse(row.expires_at))
                    ? { billing_period_end: new Date(Date.parse(row.expires_at)).toISOString() }
                    : {}),
              })
              .eq("id", row.id)
              .eq("billing_provider", "stripe")
              .select("id");
            if (!periodError && opened?.length && (periodEnd || Number.isFinite(Date.parse(chargedAt)))) {
              await markOnlinePaymentCheckoutStatus(String(inflight.reference), "paid");
              renewed++;
            } else if (!periodError && !opened?.length) {
              console.error(
                "[process-stripe-subscription-renewals] saved charge kept; another account owns the plan",
                row.id,
              );
            }
          }
          continue;
        } else {
          const updatedAt = new Date(String((inflight as { updated_at?: string }).updated_at ?? "")).getTime();
          if (Number.isFinite(updatedAt) && Date.now() - updatedAt < 3 * 24 * 60 * 60 * 1000) {
            continue;
          }
        }
      }
      const reference = generateTransactionReference("sub_stripe_renew", row.id);
      let intentSucceeded = false;

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
            expand: ["latest_charge.balance_transaction"],
          },
          { idempotencyKey: reference },
        );

        if (stripeOffSessionStillOpen(intent.status)) {
          await upsertOnlinePaymentCheckout({
            reference,
            provider: "stripe",
            tenantId,
            paymentIntentId: intent.id,
            metadata: {
              provider_id: row.provider_id,
              plan_id: row.plan_id,
              kind: "subscription_renewal",
              tenant_id: tenantId ?? "",
            },
          });
          continue;
        }

        if (intent.status !== "succeeded") {
          throw new Error(`PaymentIntent status ${intent.status}`);
        }

        intentSucceeded = true;

        await upsertOnlinePaymentCheckout({
          reference,
          provider: "stripe",
          tenantId,
          paymentIntentId: intent.id,
          metadata: {
            provider_id: row.provider_id,
            plan_id: row.plan_id,
            kind: "subscription_renewal",
            charge_captured: true,
            amount_major: amountMajor,
            tenant_id: tenantId ?? "",
          },
        });

        const periodEnd = computePaidPeriodExpiresAt(isYearly ? "yearly" : "monthly");
        const payment = await recordProviderSubscriptionPayment({
          supabase,
          providerId: row.provider_id,
          planId: row.plan_id,
          reference,
          amountMajor,
          feesMajor: resolveStripeGatewayFees({
            feeMinor: stripeIntentProcessingFeeMinor(intent),
            currency,
          }).feesMajor,
          kind: "subscription_renewal",
          billingPeriod: isYearly ? "yearly" : "monthly",
          termEndsAt: periodEnd,
          description: `Stripe subscription renewal — ${plan?.name ?? "plan"}`,
          paymentProvider: "stripe",
          tenantIdHint: tenantId,
          updateBillingPeriod: false,
        });
        if (payment.chargeReturned) continue;
        if (!payment.recorded && !payment.alreadyRecorded) {
          throw new Error("subscription payment was not recorded");
        }
        const { data: opened, error: periodError } = await supabase
          .from("provider_subscriptions")
          .update({
            expires_at: periodEnd,
            billing_period_start: nowIso,
            billing_period_end: periodEnd,
            status: "active",
            past_due_since: null,
            updated_at: nowIso,
          })
          .eq("id", row.id)
          .eq("billing_provider", "stripe")
          .select("id");
        if (periodError) throw periodError;
        if (!opened?.length) {
          console.error(
            "[process-stripe-subscription-renewals] saved charge kept; another account owns the plan",
            row.id,
          );
          continue;
        }

        await markOnlinePaymentCheckoutStatus(reference, "paid");
        renewed++;
      } catch (err) {
        const openStatus = (err as { payment_intent?: { status?: string; id?: string } } | null)?.payment_intent
          ?.status;
        const code = (err as { code?: string } | null)?.code;
        if (!intentSucceeded && (stripeOffSessionStillOpen(openStatus) || code === "authentication_required")) {
          continue;
        }
        if (intentSucceeded) {
          console.error(
            "[process-stripe-subscription-renewals] charge succeeded but was not recorded:",
            row.id,
            err,
          );
          continue;
        }
        failed++;
        await markOnlinePaymentCheckoutStatus(reference, "failed");
        const { data: markedPastDue } = await supabase
          .from("provider_subscriptions")
          .update({ status: "past_due", past_due_since: nowIso, updated_at: nowIso })
          .eq("id", row.id)
          .eq("billing_provider", "stripe")
          .eq("status", "active")
          .select("id");
        if (markedPastDue?.length && prov?.user_id) {
          try {
            await sendTemplateNotification(
              "subscription_payment_failed",
              [prov.user_id],
              {
                business_name: prov.business_name ?? "",
                grace_days: "3",
                app_url: process.env.NEXT_PUBLIC_APP_URL ?? "",
                access_note: subscriptionPaymentFailedAccessNote(true),
              },
              ["push"],
              { appType: "provider" },
            );
          } catch (notifyErr) {
            console.warn("[process-stripe-subscription-renewals] notify failed:", row.id, notifyErr);
          }
        }
        console.warn("[process-stripe-subscription-renewals] failed:", row.id, err);
      }
    }

    return successResponse({ renewed, failed });
  } catch (error) {
    return handleApiError(error, "Cron: process-stripe-subscription-renewals failed");
  }
}

function stripeIntentProcessingFeeMinor(intent: { latest_charge?: unknown }): number {
  const charge = intent.latest_charge;
  if (!charge || typeof charge !== "object") return 0;
  const balance = (charge as { balance_transaction?: unknown }).balance_transaction;
  if (balance && typeof balance === "object" && typeof (balance as { fee?: unknown }).fee === "number") {
    return (balance as { fee: number }).fee;
  }
  return 0;
}
