import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSubscription,
  disableSubscriptionByCode,
  fetchSubscription,
} from "@/lib/payments/paystack-complete";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { computePaidPeriodExpiresAt, paystackActivationFields } from "@/lib/subscriptions/provider-billing-merchant";

export type ScheduledDowngradeRow = {
  id: string;
  provider_id?: string | null;
  tenant_id?: string | null;
  plan_id: string;
  scheduled_plan_id: string;
  scheduled_change_at?: string | null;
  scheduled_billing_period?: string | null;
  billing_period?: string | null;
  paystack_authorization_code?: string | null;
  paystack_customer_code?: string | null;
  paystack_subscription_code?: string | null;
};

export type ApplyScheduledDowngradesResult = {
  downgradesApplied: number;
  downgradedProviderIds: string[];
  /** Subscriptions moved to free after failed Paystack downgrade charge. */
  expiredFromFailed: Array<{ id: string; provider_id: string }>;
};

type PlanCodes = {
  paystack_plan_code_monthly?: string | null;
  paystack_plan_code_yearly?: string | null;
};

/**
 * Cron step 0a: apply scheduled paid-to-paid downgrades at period end.
 * Paystack: disable legacy code if present, create cheaper subscription on saved auth.
 * Non-Paystack / missing auth: swap plan_id only (Stripe/Flutterwave bill current plan row).
 */
export async function applyScheduledProviderSubscriptionDowngrades(
  supabase: SupabaseClient,
  nowIso: string,
  expirePatch: (extra?: Record<string, unknown>) => Record<string, unknown>,
): Promise<ApplyScheduledDowngradesResult> {
  const { data: scheduledRows } = await supabase
    .from("provider_subscriptions")
    .select(
      "id, provider_id, tenant_id, plan_id, scheduled_plan_id, scheduled_change_at, scheduled_billing_period, billing_period, paystack_authorization_code, paystack_customer_code, paystack_subscription_code",
    )
    .not("scheduled_plan_id", "is", null)
    .not("scheduled_change_at", "is", null)
    .lte("scheduled_change_at", nowIso)
    .in("status", ["active", "trialing"]);

  let downgradesApplied = 0;
  const downgradedProviderIds: string[] = [];
  const expiredFromFailed: Array<{ id: string; provider_id: string }> = [];

  for (const row of scheduledRows ?? []) {
    const r = row as ScheduledDowngradeRow;
    const targetPlanId = r.scheduled_plan_id;
    const billingPeriod =
      r.scheduled_billing_period === "yearly" || r.scheduled_billing_period === "monthly"
        ? r.scheduled_billing_period
        : r.billing_period === "yearly"
          ? "yearly"
          : "monthly";

    const { data: targetPlan } = await supabase
      .from("subscription_plans")
      .select("id, paystack_plan_code_monthly, paystack_plan_code_yearly")
      .eq("id", targetPlanId)
      .maybeSingle();

    const planCodes = (targetPlan ?? {}) as PlanCodes;
    const paystackPlanCode =
      billingPeriod === "yearly"
        ? planCodes.paystack_plan_code_yearly
        : planCodes.paystack_plan_code_monthly;

    const auth = r.paystack_authorization_code?.trim();
    const customer = r.paystack_customer_code?.trim();

    const clearScheduled = {
      scheduled_plan_id: null,
      scheduled_change_at: null,
      scheduled_billing_period: null,
      updated_at: nowIso,
    };

    const expireToFree = async () => {
      await supabase
        .from("provider_subscriptions")
        .update({
          ...expirePatch(),
          ...clearScheduled,
        })
        .eq("id", r.id);
      if (r.provider_id) {
        expiredFromFailed.push({ id: r.id, provider_id: r.provider_id });
      }
    };

    // No saved Paystack card: Stripe / Flutterwave / legacy rows renew at the row's plan_id price.
    if (!auth) {
      await supabase
        .from("provider_subscriptions")
        .update({
          plan_id: targetPlanId,
          billing_period: billingPeriod,
          ...clearScheduled,
        })
        .eq("id", r.id);
      downgradesApplied++;
      if (r.provider_id) downgradedProviderIds.push(r.provider_id);
      continue;
    }

    const tenantId = await resolveTenantIdForFinanceLedger(supabase, {
      tenant_id: r.tenant_id ?? null,
      provider_id: r.provider_id ?? null,
    });

    // Rows scheduled before the upgrade route started disabling at schedule time still have a live
    // old sub. Never create the cheaper sub while the old one can still bill (double charge).
    const previousCode = r.paystack_subscription_code?.trim();
    if (previousCode) {
      try {
        await disableSubscriptionByCode(previousCode, { tenantId });
      } catch (disableErr) {
        let stillLive = true;
        try {
          const fetched = await fetchSubscription(previousCode, { tenantId });
          const status = String(fetched.data?.status ?? "").toLowerCase();
          stillLive = status === "active" || status === "attention";
        } catch {
          stillLive = true;
        }
        if (stillLive) {
          console.error(
            "[apply-scheduled-downgrade] old Paystack sub still live; will retry next run:",
            previousCode,
            disableErr,
          );
          continue;
        }
      }
    }

    if (!customer || !paystackPlanCode) {
      console.error("[apply-scheduled-downgrade] missing Paystack customer or plan code:", r.id);
      await expireToFree();
      continue;
    }

    try {
      const subscriptionResponse = await createSubscription(
        {
          customer,
          plan: paystackPlanCode,
          authorization: auth,
        },
        { tenantId },
      );
      const paystackSubscription = subscriptionResponse.data;
      const periodStart = new Date();
      await supabase
        .from("provider_subscriptions")
        .update({
          plan_id: targetPlanId,
          billing_period: billingPeriod,
          status: "active",
          auto_renew: true,
          cancelled_at: null,
          paystack_subscription_code: paystackSubscription?.subscription_code ?? null,
          paystack_authorization_code: auth,
          paystack_customer_code: customer,
          next_payment_date: paystackSubscription?.next_payment_date ?? null,
          expires_at: computePaidPeriodExpiresAt(billingPeriod, periodStart),
          ...clearScheduled,
          ...paystackActivationFields(),
        })
        .eq("id", r.id);
      downgradesApplied++;
      if (r.provider_id) downgradedProviderIds.push(r.provider_id);
    } catch (chargeErr) {
      console.error("[apply-scheduled-downgrade] createSubscription failed:", r.id, chargeErr);
      await expireToFree();
    }
  }

  return { downgradesApplied, downgradedProviderIds, expiredFromFailed };
}
