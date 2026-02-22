import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, successResponse, badRequestResponse } from "@/lib/supabase/api-helpers";

/**
 * POST /api/me/membership/subscribe
 * Subscribe to a membership plan
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { membership_id, provider_id, payment_method_id } = body;

    if (!membership_id) {
      return badRequestResponse("membership_id is required");
    }

    // Verify membership exists and is active
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select("*")
      .eq("id", membership_id)
      .eq("is_active", true)
      .single();

    if (membershipError || !membership) {
      return badRequestResponse("Invalid or inactive membership");
    }

    // Check if user already has an active membership
    const { data: existingMembership } = await supabase
      .from("customer_memberships")
      .select("id")
      .eq("customer_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (existingMembership) {
      return badRequestResponse("You already have an active membership. Please cancel it first.");
    }

    // Calculate expiry based on billing cycle
    const expiresAt = new Date();
    if (membership.billing_cycle === 'monthly') {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else if (membership.billing_cycle === 'yearly') {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }

    // Create customer membership
    const { data: customerMembership, error: createError } = await supabase
      .from("customer_memberships")
      .insert({
        customer_id: user.id,
        membership_id: membership_id,
        provider_id: provider_id || null,
        status: 'active',
        started_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        auto_renew: true,
        payment_method_id: payment_method_id || null,
      })
      .select()
      .single();

    if (createError) {
      throw createError;
    }

    // Process payment via Paystack
    if (membership.price && membership.price > 0) {
      const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
      if (!PAYSTACK_SECRET_KEY) {
        throw new Error("Payment system not configured");
      }

      // Initialize Paystack transaction for membership
      const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          amount: Math.round(membership.price * 100), // Convert to kobo/cents
          metadata: {
            type: "membership_subscription",
            membership_id: membership.id,
            customer_membership_id: customerMembership.id,
            customer_id: user.id,
          },
          callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/account-settings/loyalty?membership=success`,
        }),
      });

      const paystackData = await paystackResponse.json();

      if (!paystackData.status) {
        // Rollback membership creation if payment fails to initialize
        await supabase
          .from("customer_memberships")
          .delete()
          .eq("id", customerMembership.id);
        throw new Error("Failed to initialize payment");
      }

      // Update membership with payment reference
      await supabase
        .from("customer_memberships")
        .update({
          payment_reference: paystackData.data.reference,
          status: 'pending_payment',
        })
        .eq("id", customerMembership.id);

      return successResponse({
        customer_membership: customerMembership,
        payment: {
          authorization_url: paystackData.data.authorization_url,
          reference: paystackData.data.reference,
        },
        message: "Membership created. Please complete payment.",
      }, 201);
    }

    // Free membership — no payment needed
    return successResponse({
      customer_membership: customerMembership,
      message: "Successfully subscribed to membership",
    }, 201);

  } catch (error) {
    return handleApiError(error, "Failed to subscribe to membership");
  }
}
