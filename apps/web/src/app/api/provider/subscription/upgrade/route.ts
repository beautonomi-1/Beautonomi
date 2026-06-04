import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import {
  requireRoleInApi,
  getProviderIdForUser,
  notFoundResponse,
  successResponse,
  handleApiError,
  errorResponse,
} from '@/lib/supabase/api-helpers';
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { z } from 'zod';
import { createCustomer, fetchCustomer, createSubscription } from '@/lib/payments/paystack-complete';
import { sendTemplateNotification } from "@/lib/notifications/onesignal";
import { createClient } from '@supabase/supabase-js';
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { extractSubscriptionPlanUuid } from "@/lib/subscription/extract-subscription-plan-uuid";
import { formatInTz, resolveTz } from "@/lib/dates/provider-tz";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";

const upgradeSubscriptionSchema = z.object({
  plan_id: z.string().min(1, 'Plan ID is required'),
  billing_period: z.enum(["monthly", "yearly"]).default("monthly"),
});

type PlanRow = {
  id: string;
  name?: string;
  currency?: string;
  price_monthly?: number;
  price_yearly?: number;
  is_active?: boolean;
  is_free?: boolean;
  paystack_plan_code_monthly?: string | null;
  paystack_plan_code_yearly?: string | null;
};
type SubRow = { id: string };
type SubWithPlan = { subscription_plans?: { name?: string; price_monthly?: number; price_yearly?: number } | null };
type ExistingSubRow = { paystack_authorization_code?: string | null; subscription_plans?: { name?: string; price_monthly?: number; price_yearly?: number } | null };

/**
 * POST /api/provider/subscription/upgrade
 * 
 * Upgrade provider subscription using Paystack native subscriptions
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");
    const { data: providerTenantRow } = await supabase
      .from("providers")
      .select("tenant_id, timezone")
      .eq("id", providerId)
      .maybeSingle();
    const tz = resolveTz(
      (providerTenantRow as { tenant_id?: string | null; timezone?: string | null } | null)?.timezone,
    );
    if (
      !resourceTenantMatchesHostTenant(
        tenantId,
        (providerTenantRow as { tenant_id?: string | null } | null)?.tenant_id,
      )
    ) {
      return errorResponse(
        "Your provider account is not on this market. Use the site or app for the correct region.",
        "TENANT_MISMATCH",
        403,
      );
    }

    const body = await request.json();

    const parsed = upgradeSubscriptionSchema.parse(body);
    const plan_id = extractSubscriptionPlanUuid(parsed.plan_id);
    const billing_period = parsed.billing_period;

    // Get subscription plan
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("id, name, currency, price_monthly, price_yearly, is_active, is_free, paystack_plan_code_monthly, paystack_plan_code_yearly")
      .eq("id", plan_id)
      .single();
    
    const planRow = plan as PlanRow | null;
    if (planError || !planRow || planRow.is_active === false) {
      throw planError || new Error("Subscription plan not found");
    }

    if (planRow.is_free) {
      const now = new Date();

      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );

      const subscriptionTenantId = await resolveTenantIdForFinanceLedger(supabaseAdmin, {
        tenant_id: (providerTenantRow as { tenant_id?: string | null } | null)?.tenant_id ?? tenantId,
        provider_id: providerId,
      });

      const { data: subscription, error: subError } = await supabaseAdmin
        .from("provider_subscriptions")
        .upsert(
          {
            provider_id: providerId,
            tenant_id: subscriptionTenantId,
            plan_id,
            status: "active",
            started_at: now.toISOString(),
            expires_at: null,
            billing_period: billing_period,
            auto_renew: false,
            cancelled_at: null,
            paystack_sync_pending: false,
            paystack_sync_note: null,
            paystack_subscription_code: null,
            next_payment_date: null,
            updated_at: now.toISOString(),
          },
          { onConflict: "provider_id" },
        )
        .select()
        .single();

      if (subError) throw subError;

      // For free tier, send notification if upgrading from paid plan

      const { data: providerData } = await supabaseAdmin
        .from("providers")
        .select("id, business_name, user_id")
        .eq("id", providerId)
        .single();

      // Get old subscription plan for comparison
      const { data: oldSubscription } = await supabaseAdmin
        .from("provider_subscriptions")
        .select("plan_id, subscription_plans:plan_id(name, price_monthly, price_yearly)")
        .eq("provider_id", providerId)
        .neq("id", (subscription as SubRow).id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (providerData?.user_id && oldSubscription) {
        const oldPlan = (oldSubscription as SubWithPlan).subscription_plans;
        const oldPlanName = oldPlan?.name ?? "Previous Plan";
        const newPlanName = planRow.name;

        try {
          await sendTemplateNotification(
            "subscription_downgraded", // Free tier is typically a downgrade
            [providerData.user_id],
            {
              business_name: providerData.business_name || "Provider",
              plan_name: newPlanName,
              old_plan_name: oldPlanName,
              new_amount: "Free",
              billing_period: "yearly",
              effective_date: formatInTz(now, "MMM d, yyyy", tz),
              app_url: process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com",
              year: formatInTz(now, "yyyy", tz),
            },
            ["push", "email", "sms"],
            { appType: "provider" }
          );
        } catch (notifError) {
          console.error("Error sending free tier notification:", notifError);
        }
      }

      return successResponse({ subscription_id: (subscription as SubRow).id, is_free: true });
    }

    const { data: userEmailRow } = await supabase
      .from("users")
      .select("email, first_name, last_name, phone")
      .eq("id", user.id)
      .single();

    const email = userEmailRow?.email || user.email;
    if (!email) throw new Error("User email is required for payment");

    let customerCode: string;
    try {
      const customerResponse = await fetchCustomer(email, { tenantId });
      customerCode = customerResponse.data?.customer_code || email;
    } catch {
      try {
        const customerResponse = await createCustomer({
          email,
          first_name: userEmailRow?.first_name || undefined,
          last_name: userEmailRow?.last_name || undefined,
          phone: userEmailRow?.phone || undefined,
        }, { tenantId });
        customerCode = customerResponse.data?.customer_code || email;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        throw new Error(`Failed to create Paystack customer: ${msg}`);
      }
    }

    const paystackPlanCode = billing_period === "yearly"
      ? planRow.paystack_plan_code_yearly
      : planRow.paystack_plan_code_monthly;

    // Missing Paystack plan codes: do not 500 — send the client to one-off checkout
    // (`initialize-payment`) which uses amount + reference, not recurring plan codes.
    if (!paystackPlanCode) {
      return successResponse({
        requires_payment: true,
        customer_code: customerCode,
        message:
          "This plan is not linked to a Paystack recurring code yet. Complete checkout to pay and activate.",
      });
    }

    // Create Paystack subscription
    // Note: This requires an authorization code from a previous transaction
    // For first-time subscriptions, we'll need to initialize a transaction first
    // to get the authorization code, then create the subscription
    
    // Check if provider has existing subscription with authorization
    // Also get old plan details for notification
    const { data: existingSub } = await supabase
      .from("provider_subscriptions")
      .select(`
        paystack_authorization_code, 
        paystack_customer_code,
        plan_id,
        subscription_plans:plan_id(name, price_monthly, price_yearly)
      `)
      .eq("provider_id", providerId)
      .eq("status", "active")
      .single();

    const existingRow = existingSub as ExistingSubRow | null;
    const authorizationCode = existingRow?.paystack_authorization_code;
    const oldPlan = existingRow?.subscription_plans;

    if (!authorizationCode) {
      return successResponse({
        requires_payment: true,
        customer_code: customerCode,
        plan_code: paystackPlanCode,
        message: "Payment authorization required. Please complete a payment first.",
      });
    }

    // Create subscription with authorization code
    try {
      const subscriptionResponse = await createSubscription({
        customer: customerCode,
        plan: paystackPlanCode,
        authorization: authorizationCode,
      }, { tenantId });

      const paystackSubscription = subscriptionResponse.data;

      // Update or create subscription record
      const now = new Date();
      const { data: subscription, error: subError } = await supabase.from("provider_subscriptions")
        .upsert({
          provider_id: providerId,
          tenant_id: tenantId,
          plan_id,
          status: "active",
          started_at: now.toISOString(),
          billing_period,
          auto_renew: true,
          paystack_subscription_code: paystackSubscription?.subscription_code,
          paystack_authorization_code: authorizationCode,
          paystack_customer_code: customerCode,
          next_payment_date: paystackSubscription?.next_payment_date,
          paystack_sync_pending: false,
          paystack_sync_note: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "provider_id" })
        .select()
        .single();

      if (subError) throw subError;

      // Get provider and plan details for notification
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );

      const { data: providerData } = await supabaseAdmin
        .from("providers")
        .select("id, business_name, user_id")
        .eq("id", providerId)
        .single();

      const oldPlanName = oldPlan?.name ?? "Previous Plan";
      const newPlanName = planRow.name;
      const newAmount = billing_period === "yearly" ? planRow.price_yearly : planRow.price_monthly;
      const nextPaymentDate = paystackSubscription?.next_payment_date
        ? formatInTz(new Date(paystackSubscription.next_payment_date), "MMM d, yyyy", tz)
        : "N/A";

      // Determine if upgrade or downgrade by comparing plan prices
      const oldPrice = oldPlan 
        ? (billing_period === "yearly" ? oldPlan.price_yearly : oldPlan.price_monthly)
        : null;
      
      const isUpgrade = !oldPrice || (newAmount && oldPrice && newAmount > oldPrice);
      const templateKey = isUpgrade ? "subscription_upgraded" : "subscription_downgraded";

      // Send notification
      if (providerData?.user_id) {
        try {
          await sendTemplateNotification(
            templateKey,
            [providerData.user_id],
            {
              business_name: providerData.business_name || "Provider",
              plan_name: newPlanName,
              old_plan_name: oldPlanName,
              new_amount: newAmount ? `${planRow.currency ?? lastResortCurrency} ${newAmount.toLocaleString()}` : "N/A",
              billing_period: billing_period,
              next_payment_date: nextPaymentDate,
              effective_date: formatInTz(new Date(), "MMM d, yyyy", tz),
              app_url: process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com",
              year: formatInTz(new Date(), "yyyy", tz),
            },
            ["push", "email", "sms"],
            { appType: "provider" }
          );
        } catch (notifError) {
          console.error("Error sending subscription notification:", notifError);
          // Don't fail the request if notification fails
        }
      }

      return successResponse({
        subscription_id: (subscription as SubRow).id,
        paystack_subscription_code: paystackSubscription?.subscription_code,
      });
    } catch (err: unknown) {
      console.error("Paystack subscription creation error:", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      throw new Error(`Failed to create Paystack subscription: ${msg}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map(e => e.message).join(', ')),
        'Validation failed',
        'VALIDATION_ERROR',
        400
      );
    }
    return handleApiError(error, 'Failed to upgrade subscription');
  }
}
