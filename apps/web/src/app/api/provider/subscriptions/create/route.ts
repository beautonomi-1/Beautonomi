import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { initializePaystackTransactionWithPlan } from "@/lib/payments/paystack-server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const createSubscriptionSchema = z.object({
  plan_id: z.string().uuid("Invalid plan ID"),
  billing_period: z.enum(["monthly", "yearly"]),
  in_app: z.boolean().optional(),
});

/**
 * POST /api/provider/subscriptions/create
 *
 * Start a provider subscription by initializing a Paystack transaction with the plan code.
 * Customer is sent to Paystack to pay; on success Paystack creates the subscription and
 * sends subscription.create webhook, which creates/updates provider_subscriptions.
 * Returns authorization_url for the frontend to redirect the user.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);
    if (!user) {
      return errorResponse("Authentication required", "UNAUTHORIZED", 401);
    }

    const _supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate input
    const validationResult = createSubscriptionSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Invalid input data",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { plan_id, billing_period, in_app } = validationResult.data;

    // Use admin client to bypass RLS
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

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");


    // Get provider
    const { data: provider, error: providerError } = await supabaseAdmin
      .from("providers")
      .select("id, user_id, business_name, email, phone")
      .eq("user_id", user.id)
      .single();

    if (providerError || !provider) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    // Get pricing plan
    const { data: pricingPlan, error: planError } = await supabaseAdmin
      .from("pricing_plans")
      .select("id, name, price, paystack_plan_code_monthly, paystack_plan_code_yearly, subscription_plan_id")
      .eq("id", plan_id)
      .eq("is_active", true)
      .single();

    if (planError || !pricingPlan) {
      return errorResponse("Pricing plan not found or inactive", "NOT_FOUND", 404);
    }

    // Get Paystack plan code based on billing period
    const paystackPlanCode = billing_period === "monthly" 
      ? (pricingPlan as any).paystack_plan_code_monthly
      : (pricingPlan as any).paystack_plan_code_yearly;

    if (!paystackPlanCode) {
      return errorResponse(
        `Paystack plan code not configured for ${billing_period} billing`,
        "CONFIGURATION_ERROR",
        400
      );
    }

    const subscriptionPlanId = (pricingPlan as any).subscription_plan_id;
    if (!subscriptionPlanId) {
      return errorResponse(
        "This pricing plan is not linked to a subscription plan. Link it in Admin → Pricing Plans.",
        "CONFIGURATION_ERROR",
        400
      );
    }

    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("email, full_name")
      .eq("id", user.id)
      .single();

    const customerEmail = userData?.email || (provider as any).email;
    if (!customerEmail) {
      return errorResponse("User email is required for subscription", "VALIDATION_ERROR", 400);
    }

    const { data: existingSubscription } = await supabaseAdmin
      .from("provider_subscriptions")
      .select("id, status")
      .eq("provider_id", providerId)
      .in("status", ["active", "past_due"])
      .maybeSingle();

    if (existingSubscription) {
      return errorResponse(
        "Provider already has an active subscription",
        "CONFLICT",
        409
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const inAppParam = in_app ? "&in_app=1" : "";
    const callbackUrl = `${baseUrl}/provider/subscription?payment_success=true&billing_period=${billing_period}${inAppParam}`;

    const init = await initializePaystackTransactionWithPlan({
      email: customerEmail,
      plan: paystackPlanCode,
      callback_url: callbackUrl,
      metadata: {
        provider_id: providerId,
        pricing_plan_id: plan_id,
        subscription_plan_id: subscriptionPlanId,
        billing_period,
      },
      currency: "ZAR",
    });

    const authorizationUrl = init?.data?.authorization_url || null;
    if (!authorizationUrl) {
      return errorResponse(
        "Paystack did not return a payment URL",
        "PAYSTACK_ERROR",
        500
      );
    }

    return successResponse({
      authorization_url: authorizationUrl,
      access_code: init?.data?.access_code ?? null,
      reference: init?.data?.reference ?? null,
      message: "Redirect the user to authorization_url to complete subscription payment. After payment, Paystack will create the subscription and we will sync it via webhook.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to create subscription");
  }
}
