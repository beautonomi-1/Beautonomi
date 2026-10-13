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
import { computePaidPeriodExpiresAt } from "@/lib/subscriptions/provider-billing-merchant";
import { chargeAndSettleFlutterwaveOffSession } from "@/lib/payments/charge-flutterwave-off-session";

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
        "id, provider_id, plan_id, billing_period, expires_at, paystack_authorization_code, providers:provider_id ( tenant_id, user_id )",
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
        paystack_authorization_code?: string | null;
        providers?: { tenant_id?: string | null; user_id?: string | null } | Array<{
          tenant_id?: string | null;
          user_id?: string | null;
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

        if (!charged.ok) {
          failed += 1;
          continue;
        }

        const billingPeriod = isYearly ? "yearly" : "monthly";
        await recordProviderSubscriptionPayment({
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
        });
        await supabase
          .from("provider_subscriptions")
          .update({
            expires_at: computePaidPeriodExpiresAt(billingPeriod),
            updated_at: nowIso,
          })
          .eq("id", row.id);

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
