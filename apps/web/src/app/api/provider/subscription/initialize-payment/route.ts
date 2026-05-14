import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  errorResponse,
} from '@/lib/supabase/api-helpers';
import { z } from 'zod';
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { createCustomer, fetchCustomer } from '@/lib/payments/paystack-complete';
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { extractSubscriptionPlanUuid } from "@/lib/subscription/extract-subscription-plan-uuid";

const initializePaymentSchema = z.object({
  plan_id: z.string().min(1, 'Plan ID is required'),
  billing_period: z.enum(["monthly", "yearly"]).default("monthly"),
  in_app: z.boolean().optional(),
});

/**
 * POST /api/provider/subscription/initialize-payment
 * 
 * Initialize payment to get authorization code for subscription
 * This is needed for first-time subscriptions before creating recurring subscription
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
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }
    const { data: providerTenantRow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
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

    const parsed = initializePaymentSchema.parse(body);
    const plan_id = extractSubscriptionPlanUuid(parsed.plan_id);
    const billing_period = parsed.billing_period;
    const in_app = parsed.in_app;

    // Get subscription plan
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("id, name, currency, price_monthly, price_yearly, is_active, is_free, paystack_plan_code_monthly, paystack_plan_code_yearly")
      .eq("id", plan_id)
      .single();
    
    if (planError || !plan || (plan as any).is_active === false) {
      throw planError || new Error("Subscription plan not found");
    }

    if ((plan as any).is_free) {
      return errorResponse(
        "This is a free plan. Use the upgrade endpoint instead of payment initialization.",
        "FREE_PLAN",
        400,
      );
    }

    const amount =
      billing_period === "yearly"
        ? Number((plan as any).price_yearly || 0)
        : Number((plan as any).price_monthly || 0);
    
    if (!amount || amount <= 0) {
      throw new Error("Invalid plan amount for selected billing period");
    }

    // Get or create Paystack customer
    const { data: userEmailRow } = await supabase
      .from("users")
      .select("email, first_name, last_name, phone")
      .eq("id", user.id)
      .single();
    
    const email = userEmailRow?.email || user.email;
    if (!email) throw new Error("User email is required for payment");

    let customerCode: string;
    try {
      // Try to fetch existing customer
      const customerResponse = await fetchCustomer(email, { tenantId });
      customerCode = customerResponse.data?.customer_code || email;
    } catch {
      // Create new customer if doesn't exist
      try {
        const customerResponse = await createCustomer({
          email,
          first_name: userEmailRow?.first_name || undefined,
          last_name: userEmailRow?.last_name || undefined,
          phone: userEmailRow?.phone || undefined,
        }, { tenantId });
        customerCode = customerResponse.data?.customer_code || email;
      } catch (err: any) {
        throw new Error(`Failed to create Paystack customer: ${err.message}`);
      }
    }

    // Create order for tracking
    const { data: order, error: orderError } = await (supabase.from("provider_subscription_orders") as any)
      .insert({
        provider_id: providerId,
        plan_id,
        billing_period,
        amount,
        currency: (plan as any).currency || lastResortCurrency,
        status: "pending",
      })
      .select("*")
      .single();
    
    if (orderError || !order) {
      throw orderError || new Error("Failed to create subscription order");
    }

    // Initialize Paystack transaction
    const reference = generateTransactionReference("provider_subscription_auth", order.id);
    const inAppParam = in_app ? "&in_app=1" : "";
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/provider/subscription?payment_success=true&order_id=${order.id}${inAppParam}`;

    const subAppUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const subCancelAction = `${subAppUrl}/provider/subscription?payment_cancelled=1`;

    const paystackData = await initializePaystackTransaction({
      email,
      amountInSmallestUnit: convertToSmallestUnit(amount),
      currency: (plan as any).currency || lastResortCurrency,
      reference,
      callback_url: callbackUrl,
      metadata: {
        provider_subscription_order_id: order.id,
        provider_id: providerId,
        plan_id,
        billing_period,
        customer_code: customerCode,
        kind: "subscription_authorization",
        cancel_action: subCancelAction,
      },
      tenantId,
    });

    const paymentUrl = paystackData?.data?.authorization_url || null;

    await (supabase.from("provider_subscription_orders") as any)
      .update({ 
        paystack_reference: reference, 
        updated_at: new Date().toISOString() 
      })
      .eq("id", order.id);

    return successResponse({
      order_id: order.id,
      payment_url: paymentUrl,
      /** Same URL as `payment_url` — Paystack calls it `authorization_url` in their API response. */
      authorization_url: paymentUrl,
      customer_code: customerCode,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map(e => e.message).join(', ')),
        'Validation failed',
        'VALIDATION_ERROR',
        400
      );
    }
    return handleApiError(error, 'Failed to initialize subscription payment');
  }
}
