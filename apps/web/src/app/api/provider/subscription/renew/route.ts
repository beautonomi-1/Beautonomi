import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser, notFoundResponse } from '@/lib/supabase/api-helpers';
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";

/**
 * POST /api/provider/subscription/renew
 * 
 * Renew provider subscription
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    // Get current subscription
    const { data: subscription } = await supabase
      .from('provider_subscriptions')
      .select('*')
      .eq('provider_id', providerId)
      .single();

    if (!subscription) {
      return notFoundResponse('No subscription found');
    }

    const sub = subscription as any;
    const billingPeriod = (sub.billing_period || "monthly") as "monthly" | "yearly";

    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("id, name, currency, price_monthly, price_yearly, is_active")
      .eq("id", sub.plan_id)
      .single();
    if (planError || !plan || (plan as any).is_active === false) {
      throw planError || new Error("Subscription plan not found");
    }

    const amount =
      billingPeriod === "yearly"
        ? Number((plan as any).price_yearly || 0)
        : Number((plan as any).price_monthly || 0);
    if (!amount || amount <= 0) throw new Error("Invalid plan amount");

    const { data: order, error: orderError } = await (supabase.from("provider_subscription_orders") as any)
      .insert({
        provider_id: providerId,
        plan_id: sub.plan_id,
        billing_period: billingPeriod,
        amount,
        currency: (plan as any).currency || "ZAR",
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
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/checkout/success?payment_type=provider_subscription`;

    const paystackData = await initializePaystackTransaction({
      email,
      amountInSmallestUnit: convertToSmallestUnit(amount),
      currency: (plan as any).currency || "ZAR",
      reference,
      callback_url: callbackUrl,
      metadata: {
        provider_subscription_order_id: order.id,
        provider_id: providerId,
        plan_id: sub.plan_id,
        billing_period: billingPeriod,
      },
    });

    const paymentUrl = paystackData?.data?.authorization_url || null;

    await (supabase.from("provider_subscription_orders") as any)
      .update({ paystack_reference: reference, updated_at: new Date().toISOString() })
      .eq("id", order.id);

    return successResponse({ order_id: order.id, payment_url: paymentUrl });
  } catch (error) {
    return handleApiError(error, 'Failed to renew subscription');
  }
}
