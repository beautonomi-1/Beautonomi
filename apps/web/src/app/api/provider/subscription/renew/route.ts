import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
  errorResponse,
} from '@/lib/supabase/api-helpers';
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { addMonths, addYears } from "date-fns";
import { fromBusinessTime, nowInTz, resolveTz } from "@/lib/dates/provider-tz";

/**
 * POST /api/provider/subscription/renew
 * 
 * Renew provider subscription
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }
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

    const body = await request.json().catch(() => ({}));
    const in_app = !!((body as { in_app?: boolean }).in_app);
    const callbackFromClient =
      typeof (body as { callback_url?: string }).callback_url === "string"
        ? (body as { callback_url?: string }).callback_url!.trim()
        : "";

    // Get current subscription
    const { data: subscription } = await supabase
      .from('provider_subscriptions')
      .select('*')
      .eq('provider_id', providerId)
      .single();

    if (!subscription) {
      return notFoundResponse('No subscription found');
    }

    type SubRow = { billing_period?: string; plan_id?: string };
    type PlanRow = { id: string; name?: string; currency?: string; price_monthly?: number; price_yearly?: number; is_active?: boolean };
    const sub = subscription as SubRow;
    const billingPeriod = (sub.billing_period ?? "monthly") as "monthly" | "yearly";

    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("id, name, currency, price_monthly, price_yearly, is_active")
      .eq("id", sub.plan_id)
      .single();
    const planData = plan as PlanRow | null;
    if (planError || !planData || planData.is_active === false) {
      throw planError ?? new Error("Subscription plan not found");
    }

    const amount =
      billingPeriod === "yearly"
        ? Number(planData.price_yearly ?? 0)
        : Number(planData.price_monthly ?? 0);
    if (!amount || amount <= 0) {
      const now = new Date();
      const zNow = nowInTz(tz);
      const expiresAt =
        billingPeriod === "yearly"
          ? fromBusinessTime(addYears(zNow, 1), tz)
          : fromBusinessTime(addMonths(zNow, 1), tz);
      await supabase
        .from("provider_subscriptions")
        .update({
          status: "active",
          started_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("provider_id", providerId);

      return successResponse({
        message: "Free plan renewed successfully.",
        is_free: true,
      });
    }

    const { data: order, error: orderError } = await supabase
      .from("provider_subscription_orders")
      .insert({
        provider_id: providerId,
        plan_id: sub.plan_id,
        billing_period: billingPeriod,
        amount,
        currency: planData.currency ?? lastResortCurrency,
        status: "pending",
      })
      .select("*")
      .single();
    if (orderError || !order) throw orderError || new Error("Failed to create subscription order");

    const { data: userEmailRow } = await supabase
      .from("users")
      .select("email")
      .eq("id", user.id)
      .single();
    const email = userEmailRow?.email || user.email;
    if (!email) throw new Error("User email is required for payment");

    const reference = generateTransactionReference("provider_subscription", order.id);
    /**
     * §Provider-paystack-audit 2026-05: Paystack `callback_url` must be HTTPS.
     * Provider mobile previously passed `provider://...` in `callback_url` —
     * Paystack ignored it and customers (or providers) landed on the wrong page.
     * Always use HTTPS for Paystack; leave `callbackFromClient` only as a legacy
     * override when the caller already provided an HTTPS URL.
     */
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    const isHttpsClientCallback =
      typeof callbackFromClient === "string" &&
      /^https?:\/\//i.test(callbackFromClient);
    const inAppParam = in_app ? "&in_app=1" : "";
    const callbackUrl =
      in_app && isHttpsClientCallback
        ? `${callbackFromClient}${callbackFromClient.includes("?") ? "&" : "?"}payment_success=true&order_id=${order.id}`
        : `${baseUrl}/provider/subscription?payment_success=true&order_id=${order.id}${inAppParam}`;

    const renewCancelAction =
      in_app && isHttpsClientCallback
        ? `${callbackFromClient}${callbackFromClient.includes("?") ? "&" : "?"}payment_cancelled=1`
        : `${baseUrl}/provider/subscription?payment_cancelled=1${inAppParam}`;

    const paystackData = await initializePaystackTransaction({
      email,
      amountInSmallestUnit: convertToSmallestUnit(amount),
      currency: planData.currency ?? lastResortCurrency,
      reference,
      callback_url: callbackUrl,
      metadata: {
        provider_subscription_order_id: order.id,
        provider_id: providerId,
        plan_id: sub.plan_id,
        billing_period: billingPeriod,
        cancel_action: renewCancelAction,
      },
      tenantId,
    });

    const paymentUrl = paystackData?.data?.authorization_url || null;

    await supabase
      .from("provider_subscription_orders")
      .update({ paystack_reference: reference, updated_at: new Date().toISOString() })
      .eq("id", order.id);

    return successResponse({
      order_id: order.id,
      payment_url: paymentUrl,
      authorization_url: paymentUrl,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to renew subscription');
  }
}
