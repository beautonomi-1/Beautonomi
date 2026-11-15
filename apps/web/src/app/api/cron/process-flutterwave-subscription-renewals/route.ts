/**
 * Off-session Flutterwave renewals for provider platform subscriptions (billing_provider = flutterwave).
 * Uses saved card token stored on `paystack_authorization_code` (legacy column name).
 */
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { generateTransactionReference } from "@/lib/payments/paystack";
import { convertToSmallestUnit } from "@/lib/payments/paystack";
import { upsertOnlinePaymentCheckout } from "@/lib/payments/online-payment-checkouts";
import { recordProviderSubscriptionPayment } from "@/lib/subscriptions/provider-subscription-payment";
import {
  capturedRenewalAccess,
  computePaidPeriodExpiresAt,
} from "@/lib/subscriptions/provider-billing-merchant";
import { chargeAndSettleFlutterwaveOffSession } from "@/lib/payments/charge-flutterwave-off-session";
import { subscriptionPaymentFailedAccessNote } from "@/lib/iap/apple/billing-active";
import { sendTemplateNotification } from "@/lib/notifications/onesignal";
import { markOnlinePaymentCheckoutStatus } from "@/lib/payments/online-payment-checkouts";

const JOB_NAME = "process-flutterwave-subscription-renewals";
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
        "id, provider_id, plan_id, billing_period, expires_at, paystack_authorization_code, providers:provider_id ( tenant_id, user_id, business_name )",
      )
      .eq("billing_provider", "flutterwave")
      .eq("status", "active")
      .eq("auto_renew", true)
      .not("paystack_authorization_code", "is", null)
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
        paystack_authorization_code?: string | null;
        providers?:
          | { tenant_id?: string | null; user_id?: string | null; business_name?: string | null }
          | Array<{
              tenant_id?: string | null;
              user_id?: string | null;
              business_name?: string | null;
            }>;
      };

      const token = row.paystack_authorization_code?.trim();
      if (!token) continue;

      const prov = Array.isArray(row.providers) ? row.providers[0] : row.providers;
      const tenantId = prov?.tenant_id ?? null;
      const userId = prov?.user_id ?? null;
      if (!userId) {
        failed += 1;
        continue;
      }

      const { data: userRow } = await supabase.from("users").select("email").eq("id", userId).maybeSingle();
      const email = (userRow as { email?: string } | null)?.email;
      if (!email) {
        failed += 1;
        continue;
      }

      const { data: planRow } = await supabase
        .from("subscription_plans")
        .select("price_monthly, price_yearly, currency, name")
        .eq("id", row.plan_id)
        .maybeSingle();
      const plan = planRow as {
        price_monthly?: number | null;
        price_yearly?: number | null;
        currency?: string | null;
      } | null;

      const isYearly = row.billing_period === "yearly";
      const amountMajor = Number(isYearly ? plan?.price_yearly : plan?.price_monthly) || 0;
      if (amountMajor <= 0) continue;

      const currency = (plan?.currency || "ZAR").toUpperCase();
      const { data: inflight, error: inflightError } = await supabase
        .from("online_payment_checkouts")
        .select("reference, metadata, updated_at")
        .eq("provider", "flutterwave")
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
            reference: String(inflight.reference),
            providerId: row.provider_id,
            amountMajor: Number.isFinite(savedAmount) && savedAmount > 0 ? savedAmount : amountMajor,
            feesMajor: 0,
            planId: row.plan_id,
            paymentTransactionType: "charge",
            kind: "subscription_renewal",
            description: "Provider subscription renewal",
            tenantIdHint: tenantId,
            paymentProvider: "flutterwave",
            billingPeriod,
            termEndsAt: periodEnd ?? (row.expires_at && Number.isFinite(Date.parse(row.expires_at))
              ? new Date(Date.parse(row.expires_at)).toISOString()
              : null),
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
              .eq("billing_provider", "flutterwave")
              .select("id");
            if (!periodError && opened?.length && (periodEnd || Number.isFinite(Date.parse(chargedAt)))) {
              await markOnlinePaymentCheckoutStatus(String(inflight.reference), "paid");
              renewed += 1;
            } else if (!periodError && !opened?.length) {
              console.error(
                "[process-flutterwave-subscription-renewals] saved charge kept; another account owns the plan",
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
      const reference = generateTransactionReference("sub_flw_renew", row.id);

      try {
        await upsertOnlinePaymentCheckout({
          reference,
          provider: "flutterwave",
          tenantId,
          metadata: {
            provider_id: row.provider_id,
            plan_id: row.plan_id,
            kind: "subscription_renewal",
            tenant_id: tenantId ?? "",
          },
        });

        const charged = await chargeAndSettleFlutterwaveOffSession(supabase, {
          tenantId,
          token,
          email,
          amountInSmallestUnit: convertToSmallestUnit(amountMajor, currency),
          currency,
          reference,
          metadata: {
            provider_id: row.provider_id,
            plan_id: row.plan_id,
            kind: "subscription_renewal",
          },
        });

        if (charged.ok === false && charged.pending === true) {
          continue;
        }
        if (!charged.ok) {
          await markOnlinePaymentCheckoutStatus(reference, "failed");
          const { data: markedPastDue } = await supabase
            .from("provider_subscriptions")
            .update({
              status: "past_due",
              last_dunning_retry_at: nowIso,
              past_due_since: nowIso,
              updated_at: nowIso,
            })
            .eq("id", row.id)
            .eq("billing_provider", "flutterwave")
            .eq("status", "active")
            .select("id");
          if (markedPastDue?.length && userId) {
            try {
              await sendTemplateNotification(
                "subscription_payment_failed",
                [userId],
                {
                  business_name: prov?.business_name ?? "",
                  grace_days: "3",
                  app_url: process.env.NEXT_PUBLIC_APP_URL ?? "",
                  access_note: subscriptionPaymentFailedAccessNote(true),
                },
                ["push"],
                { appType: "provider" },
              );
            } catch (notifyErr) {
              console.warn("[process-flutterwave-subscription-renewals] notify failed:", row.id, notifyErr);
            }
          }
          failed += 1;
          continue;
        }

        const billingPeriod = isYearly ? "yearly" : "monthly";
        await upsertOnlinePaymentCheckout({
          reference,
          provider: "flutterwave",
          tenantId,
          metadata: {
            provider_id: row.provider_id,
            plan_id: row.plan_id,
            kind: "subscription_renewal",
            charge_captured: true,
            amount_major: amountMajor,
            tenant_id: tenantId ?? "",
          },
        });
        const periodEnd = computePaidPeriodExpiresAt(billingPeriod);
        const payment = await recordProviderSubscriptionPayment({
          supabase,
          reference,
          providerId: row.provider_id,
          amountMajor,
          feesMajor: 0,
          planId: row.plan_id,
          paymentTransactionType: "charge",
          kind: "subscription_renewal",
          description: "Provider subscription renewal",
          tenantIdHint: tenantId,
          paymentProvider: "flutterwave",
          billingPeriod,
          termEndsAt: periodEnd,
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
          .eq("billing_provider", "flutterwave")
          .select("id");
        if (periodError) throw periodError;
        if (!opened?.length) {
          console.error(
            "[process-flutterwave-subscription-renewals] saved charge kept; another account owns the plan",
            row.id,
          );
          continue;
        }
        await markOnlinePaymentCheckoutStatus(reference, "paid");

        renewed += 1;
      } catch (err) {
        console.error("[process-flutterwave-subscription-renewals]", row.id, err);
        failed += 1;
      }
    }

    return successResponse({ renewed, failed, scanned: rows?.length ?? 0 });
  } catch (error) {
    return handleApiError(error, "Failed to process Flutterwave subscription renewals");
  }
}
