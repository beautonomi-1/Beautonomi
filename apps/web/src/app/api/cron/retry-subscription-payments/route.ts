/**
 * GET /api/cron/retry-subscription-payments
 *
 * Dunning retries for Paystack-billed provider subscriptions in past_due.
 * Retries on days 1, 3, 5 after last failure using saved authorization_code.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import { chargeAuthorization, convertFromSmallestUnit } from "@/lib/payments/paystack-complete";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { recordProviderSubscriptionPayment } from "@/lib/subscriptions/provider-subscription-payment";
import { sendTemplateNotification } from "@/lib/notifications/onesignal";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const JOB_NAME = "retry-subscription-payments";
export const maxDuration = 300;

const RETRY_DAYS = [1, 3, 5] as const;
const MAX_RETRIES = RETRY_DAYS.length;

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 999;
  return (Date.now() - new Date(iso).getTime()) / (86400000);
}

function shouldRetryToday(retryCount: number, daysSinceLast: number): boolean {
  const targetDay = RETRY_DAYS[retryCount];
  if (targetDay == null) return false;
  return daysSinceLast >= targetDay;
}

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return new Response(auth.error || "Unauthorized", { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob(request));
}

async function runJob(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    const { data: rows, error } = await supabase
      .from("provider_subscriptions")
      .select(`
        id,
        provider_id,
        plan_id,
        billing_period,
        paystack_authorization_code,
        dunning_retry_count,
        last_dunning_retry_at,
        updated_at,
        providers:provider_id ( user_id, business_name, tenant_id )
      `)
      .eq("status", "past_due")
      .neq("billing_provider", "apple")
      .not("paystack_authorization_code", "is", null)
      .lt("dunning_retry_count", MAX_RETRIES);

    if (error) throw error;

    let retried = 0;
    let recovered = 0;
    let failed = 0;

    for (const sub of rows ?? []) {
      const row = sub as {
        id: string;
        provider_id: string;
        plan_id: string;
        billing_period?: string | null;
        paystack_authorization_code?: string | null;
        dunning_retry_count?: number | null;
        last_dunning_retry_at?: string | null;
        updated_at?: string | null;
        providers?: { user_id?: string; business_name?: string; tenant_id?: string } | Array<{ user_id?: string; business_name?: string; tenant_id?: string }>;
      };

      const retryCount = Number(row.dunning_retry_count ?? 0);
      const anchor = row.last_dunning_retry_at ?? row.updated_at ?? null;
      const days = daysSince(anchor);
      if (!shouldRetryToday(retryCount, days)) continue;

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

      const prov = Array.isArray(row.providers) ? row.providers[0] : row.providers;
      const { data: userRow } = prov?.user_id
        ? await supabase.from("users").select("email").eq("id", prov.user_id).maybeSingle()
        : { data: null };
      const email = (userRow as { email?: string } | null)?.email;
      if (!email) continue;

      const reference = generateTransactionReference("sub_dunning", row.id);
      const tenantId = prov?.tenant_id ?? undefined;

      try {
        const chargeResult = await chargeAuthorization(
          String(row.paystack_authorization_code),
          email,
          convertToSmallestUnit(amountMajor),
          {
            provider_id: row.provider_id,
            plan_id: row.plan_id,
            dunning_retry: true,
            subscription_id: row.id,
          },
          { tenantId, reference },
        );

        const status = String(chargeResult.data?.status ?? "");
        if (status !== "success") {
          throw new Error(chargeResult.message || "Charge not successful");
        }

        const feesMajor = convertFromSmallestUnit(Number(chargeResult.data?.fees ?? 0));
        await recordProviderSubscriptionPayment({
          supabase,
          providerId: row.provider_id,
          planId: row.plan_id,
          reference,
          amountMajor,
          feesMajor,
          kind: "subscription_renewal",
          billingPeriod: isYearly ? "yearly" : "monthly",
          description: `Subscription renewal (dunning retry) — ${plan?.name ?? "plan"}`,
        });

        await supabase
          .from("provider_subscriptions")
          .update({
            status: "active",
            dunning_retry_count: 0,
            last_dunning_retry_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", row.id);

        recovered++;
      } catch (chargeErr) {
        failed++;
        await supabase
          .from("provider_subscriptions")
          .update({
            dunning_retry_count: retryCount + 1,
            last_dunning_retry_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", row.id);

        if (prov?.user_id) {
          try {
            await sendTemplateNotification(
              "subscription_payment_failed",
              [prov.user_id],
              { business_name: prov.business_name ?? "", grace_days: "3", app_url: process.env.NEXT_PUBLIC_APP_URL ?? "" },
              ["push", "email"],
              { appType: "provider", skipInApp: true },
            );
          } catch {
            /* best-effort */
          }
        }
        console.warn("[retry-subscription-payments] charge failed:", row.id, chargeErr);

        if (retryCount + 1 >= MAX_RETRIES) {
          void import("@/lib/integrations/slack/ops-triggers")
            .then(({ slackNotifySubscriptionChurned }) =>
              slackNotifySubscriptionChurned({
                tenantId: prov?.tenant_id ?? null,
                subscriptionId: row.id,
                providerId: row.provider_id,
                providerName: prov?.business_name ?? null,
                planName: plan?.name ?? null,
                reason: "dunning_exhausted",
                mrrMajor: amountMajor,
                currency: plan?.currency ?? null,
              }),
            )
            .catch(() => undefined);
        }
      }
      retried++;
    }

    return successResponse({ retried, recovered, failed });
  } catch (error) {
    return handleApiError(error, "Cron: retry-subscription-payments failed");
  }
}
