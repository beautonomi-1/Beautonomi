import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getPaystackSecretKey } from "@/lib/payments/paystack-server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const createSubscriptionSchema = z.object({
  plan_id: z.string().uuid("Invalid plan ID"),
  billing_period: z.enum(["monthly", "yearly"]),
});/**
 * POST /api/provider/subscriptions/create
 * 
 * Create a Paystack subscription for a provider
 * Following Paystack subscription API: https://paystack.com/docs/payments/subscriptions/
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

    const { plan_id, billing_period } = validationResult.data;

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

    // Get user email for Paystack customer
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("email, full_name")
      .eq("id", user.id)
      .single();

    const customerEmail = userData?.email || (provider as any).email;
    if (!customerEmail) {
      return errorResponse("User email is required for subscription", "VALIDATION_ERROR", 400);
    }

    // Check if provider already has an active subscription
    const { data: existingSubscription } = await supabaseAdmin
      .from("provider_subscriptions")
      .select("id, status")
      .eq("provider_id", providerId)
      .in("status", ["active", "trialing"])
      .maybeSingle();

    if (existingSubscription) {
      return errorResponse(
        "Provider already has an active subscription",
        "CONFLICT",
        409
      );
    }

    // Get Paystack secret key
    const secretKey = await getPaystackSecretKey();

    // Create Paystack customer if doesn't exist
    let paystackCustomerCode: string;
    try {
      // Check if customer exists
      const customerResponse = await fetch(
        `https://api.paystack.co/customer?email=${encodeURIComponent(customerEmail)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const customerData = await customerResponse.json();
      
      if (customerData.status && customerData.data && customerData.data.length > 0) {
        // Customer exists
        paystackCustomerCode = customerData.data[0].customer_code;
      } else {
        // Create new customer
        const createCustomerResponse = await fetch("https://api.paystack.co/customer", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: customerEmail,
            first_name: userData?.full_name?.split(" ")[0] || "",
            last_name: userData?.full_name?.split(" ").slice(1).join(" ") || "",
            phone: (provider as any).phone || "",
          }),
        });

        const createCustomerData = await createCustomerResponse.json();
        if (!createCustomerResponse.ok || !createCustomerData.status) {
          throw new Error(createCustomerData.message || "Failed to create Paystack customer");
        }

        paystackCustomerCode = createCustomerData.data.customer_code;
      }
    } catch (error: any) {
      console.error("Error creating/fetching Paystack customer:", error);
      return errorResponse(
        `Failed to create Paystack customer: ${error.message}`,
        "PAYSTACK_ERROR",
        500
      );
    }

    // Create Paystack subscription
    // Note: For subscriptions, we need to initialize a transaction first to get authorization
    // Then create the subscription with that authorization
    // This is a simplified version - in production, you'd handle the payment authorization flow first
    try {
      const subscriptionResponse = await fetch("https://api.paystack.co/subscription", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer: paystackCustomerCode,
          plan: paystackPlanCode,
        }),
      });

      const subscriptionData = await subscriptionResponse.json();
      
      if (!subscriptionResponse.ok || !subscriptionData.status) {
        throw new Error(subscriptionData.message || "Failed to create Paystack subscription");
      }

      const paystackSubscription = subscriptionData.data;

      // Get subscription_plan_id if linked
      const subscriptionPlanId = (pricingPlan as any).subscription_plan_id;

      // Create provider_subscription record
      const { data: providerSubscription, error: subError } = await (supabaseAdmin
        .from("provider_subscriptions") as any)
        .insert({
          provider_id: providerId,
          plan_id: subscriptionPlanId || plan_id, // Use subscription_plan_id if linked, otherwise pricing_plan_id
          status: paystackSubscription.status === "active" ? "active" : "trialing",
          paystack_subscription_code: paystackSubscription.subscription_code,
          paystack_customer_code: paystackCustomerCode,
          paystack_authorization_code: paystackSubscription.authorization?.authorization_code || null,
          billing_period: billing_period,
          auto_renew: true,
          next_payment_date: paystackSubscription.next_payment_date 
            ? new Date(paystackSubscription.next_payment_date).toISOString() 
            : null,
          started_at: paystackSubscription.createdAt 
            ? new Date(paystackSubscription.createdAt).toISOString() 
            : new Date().toISOString(),
          expires_at: billing_period === "monthly"
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
            : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 365 days
        })
        .select()
        .single();

      if (subError || !providerSubscription) {
        console.error("Error creating provider subscription:", subError);
        // Note: Paystack subscription was created, but DB record failed
        // In production, you might want to handle this differently
        return errorResponse(
          "Subscription created in Paystack but failed to save locally",
          "DATABASE_ERROR",
          500
        );
      }

      return successResponse({
        subscription: providerSubscription,
        paystack_subscription_code: paystackSubscription.subscription_code,
        authorization_url: paystackSubscription.authorization?.authorization_url || null,
        message: "Subscription created successfully",
      });
    } catch (error: any) {
      console.error("Error creating Paystack subscription:", error);
      return errorResponse(
        `Failed to create Paystack subscription: ${error.message}`,
        "PAYSTACK_ERROR",
        500
      );
    }
  } catch (error) {
    return handleApiError(error, "Failed to create subscription");
  }
}
