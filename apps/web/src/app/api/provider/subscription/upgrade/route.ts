import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from '@/lib/supabase/api-helpers';
import { z } from 'zod';
import { createCustomer, fetchCustomer, createSubscription } from '@/lib/payments/paystack-complete';
import { sendTemplateNotification } from "@/lib/notifications/onesignal";
import { createClient } from '@supabase/supabase-js';

const upgradeSubscriptionSchema = z.object({
  plan_id: z.string().uuid('Plan ID is required'),
  billing_period: z.enum(["monthly", "yearly"]).default("monthly"),
});

/**
 * POST /api/provider/subscription/upgrade
 * 
 * Upgrade provider subscription using Paystack native subscriptions
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");
    const body = await request.json();

    const { plan_id, billing_period } = upgradeSubscriptionSchema.parse(body);

    // Get subscription plan
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("id, name, currency, price_monthly, price_yearly, is_active, is_free, paystack_plan_code_monthly, paystack_plan_code_yearly")
      .eq("id", plan_id)
      .single();
    
    if (planError || !plan || (plan as any).is_active === false) {
      throw planError || new Error("Subscription plan not found");
    }

    // Handle free tier
    if ((plan as any).is_free) {
      // For free tier, just create subscription record without Paystack
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setFullYear(expiresAt.getFullYear() + 1); // Free tier valid for 1 year

      const { data: subscription, error: subError } = await (supabase.from("provider_subscriptions") as any)
        .upsert({
          provider_id: providerId,
          plan_id,
          status: "active",
          started_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          billing_period: "yearly",
          auto_renew: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: "provider_id" })
        .select()
        .single();

      if (subError) throw subError;

      // For free tier, send notification if upgrading from paid plan
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

      // Get old subscription plan for comparison
      const { data: oldSubscription } = await supabaseAdmin
        .from("provider_subscriptions")
        .select("plan_id, subscription_plans:plan_id(name, price_monthly, price_yearly)")
        .eq("provider_id", providerId)
        .neq("id", (subscription as any).id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (providerData?.user_id && oldSubscription) {
        const oldPlan = (oldSubscription as any).subscription_plans;
        const oldPlanName = oldPlan?.name || "Previous Plan";
        const newPlanName = (plan as any).name;

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
              effective_date: new Date().toLocaleDateString(),
              app_url: process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com",
              year: new Date().getFullYear().toString(),
            },
            ["push", "email", "sms"]
          );
        } catch (notifError) {
          console.error("Error sending free tier notification:", notifError);
        }
      }

      return successResponse({ subscription_id: (subscription as any).id, is_free: true });
    }

    // For paid plans, use Paystack subscriptions
    const paystackPlanCode = billing_period === "yearly" 
      ? (plan as any).paystack_plan_code_yearly 
      : (plan as any).paystack_plan_code_monthly;

    if (!paystackPlanCode) {
      throw new Error(`Paystack plan code not found for ${billing_period} billing period`);
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
      const customerResponse = await fetchCustomer(email);
      customerCode = customerResponse.data?.customer_code || email;
    } catch {
      // Create new customer if doesn't exist
      try {
        const customerResponse = await createCustomer({
          email,
          first_name: userEmailRow?.first_name || undefined,
          last_name: userEmailRow?.last_name || undefined,
          phone: userEmailRow?.phone || undefined,
        });
        customerCode = customerResponse.data?.customer_code || email;
      } catch (err: any) {
        throw new Error(`Failed to create Paystack customer: ${err.message}`);
      }
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

    const authorizationCode = (existingSub as any)?.paystack_authorization_code;
    const oldPlan = (existingSub as any)?.subscription_plans;

    if (!authorizationCode) {
      // No authorization code - need to initialize payment first
      // Return a flag indicating payment initialization is needed
      return successResponse({ 
        requires_payment: true,
        customer_code: customerCode,
        plan_code: paystackPlanCode,
        message: "Payment authorization required. Please complete a payment first."
      });
    }

    // Create subscription with authorization code
    try {
      const subscriptionResponse = await createSubscription({
        customer: customerCode,
        plan: paystackPlanCode,
        authorization: authorizationCode,
      });

      const paystackSubscription = subscriptionResponse.data;

      // Update or create subscription record
      const now = new Date();
      const { data: subscription, error: subError } = await (supabase.from("provider_subscriptions") as any)
        .upsert({
          provider_id: providerId,
          plan_id,
          status: "active",
          started_at: now.toISOString(),
          billing_period,
          auto_renew: true,
          paystack_subscription_code: paystackSubscription?.subscription_code,
          paystack_authorization_code: authorizationCode,
          paystack_customer_code: customerCode,
          next_payment_date: paystackSubscription?.next_payment_date,
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

      const oldPlanName = oldPlan?.name || "Previous Plan";
      const newPlanName = (plan as any).name;
      const newAmount = billing_period === "yearly" 
        ? (plan as any).price_yearly 
        : (plan as any).price_monthly;
      const nextPaymentDate = paystackSubscription?.next_payment_date 
        ? new Date(paystackSubscription.next_payment_date).toLocaleDateString()
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
              new_amount: newAmount ? `${(plan as any).currency || "ZAR"} ${newAmount.toLocaleString()}` : "N/A",
              billing_period: billing_period,
              next_payment_date: nextPaymentDate,
              effective_date: new Date().toLocaleDateString(),
              app_url: process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com",
              year: new Date().getFullYear().toString(),
            },
            ["push", "email", "sms"]
          );
        } catch (notifError) {
          console.error("Error sending subscription notification:", notifError);
          // Don't fail the request if notification fails
        }
      }

      return successResponse({ 
        subscription_id: (subscription as any).id,
        paystack_subscription_code: paystackSubscription?.subscription_code,
      });
    } catch (err: any) {
      console.error("Paystack subscription creation error:", err);
      throw new Error(`Failed to create Paystack subscription: ${err.message}`);
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
