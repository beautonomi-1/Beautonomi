import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, successResponse, errorResponse } from "@/lib/supabase/api-helpers";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";

const schema = z.object({
  plan_id: z.string().uuid(),
});

/**
 * POST /api/me/memberships/purchase
 * Body: { plan_id }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return errorResponse("Authentication required", "AUTH_REQUIRED", 401);

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return errorResponse("Validation failed", "VALIDATION_ERROR", 400, parsed.error.issues);

    const { data: plan, error: planError } = await (supabase.from("membership_plans") as any)
      .select("*")
      .eq("id", parsed.data.plan_id)
      .eq("is_active", true)
      .single();

    if (planError || !plan) return errorResponse("Membership plan not found", "NOT_FOUND", 404);

    const planData = plan as any;
    const amount = Number(planData.price_monthly || 0);
    const currency = planData.currency || "ZAR";

    const { data: order, error: orderError } = await (supabase.from("membership_orders") as any)
      .insert({
        user_id: user.id,
        provider_id: planData.provider_id,
        plan_id: planData.id,
        amount,
        currency,
        status: "pending",
      })
      .select("*")
      .single();

    if (orderError || !order) throw orderError || new Error("Failed to create membership order");

    const reference = generateTransactionReference("membership", order.id);
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/checkout/success`;

    const paystackData = await initializePaystackTransaction({
      email: user.email!,
      amountInSmallestUnit: convertToSmallestUnit(amount),
      currency,
      reference,
      callback_url: callbackUrl,
      metadata: {
        membership_order_id: order.id,
        user_id: user.id,
        provider_id: planData.provider_id,
        plan_id: planData.id,
      },
    });

    const paymentUrl = paystackData?.data?.authorization_url || null;
    await (supabase.from("membership_orders") as any)
      .update({ paystack_reference: reference })
      .eq("id", order.id);

    return successResponse({ order_id: order.id, reference, payment_url: paymentUrl });
  } catch (error) {
    return handleApiError(error, "Failed to initialize membership purchase");
  }
}

