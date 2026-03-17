import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, successResponse, errorResponse } from "@/lib/supabase/api-helpers";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";

const schema = z.object({
  membership_id: z.string().uuid(),
  provider_id: z.string().uuid(),
});

/**
 * POST /api/me/membership/subscribe
 * Body: { membership_id (plan id), provider_id }
 * Returns: { payment: { authorization_url } } for customer app partner-profile Subscribe flow.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, parsed.error.issues);

    const { membership_id: planId, provider_id: providerId } = parsed.data;

    const { data: plan, error: planError } = await (supabase.from("membership_plans") as any)
      .select("*")
      .eq("id", planId)
      .eq("is_active", true)
      .single();

    if (planError || !plan)
      return errorResponse("Membership plan not found", "NOT_FOUND", 404);

    const planData = plan as { id: string; provider_id: string; price_monthly?: number; currency?: string };
    if (planData.provider_id !== providerId)
      return errorResponse("Plan does not belong to this provider", "FORBIDDEN", 403);

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

    if (orderError || !order)
      throw orderError || new Error("Failed to create membership order");

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

    return successResponse({
      order_id: order.id,
      reference,
      payment: { authorization_url: paymentUrl },
    });
  } catch (error) {
    return handleApiError(error, "Failed to subscribe to membership");
  }
}
