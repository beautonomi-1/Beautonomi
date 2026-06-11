/**
 * POST /api/provider/ads/budget-orders/[id]/abandon
 *
 * Marks an in-flight Paystack checkout as abandoned so the campaign list can
 * offer retry/cancel instead of staying on "confirming payment…" forever.
 */

import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { reverseAdsBudgetOrderPayment } from "@/lib/ads/ads-budget-order-payment";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const { id: orderId } = await params;
    if (!orderId) return errorResponse("Order id is required", "VALIDATION", 400);

    const supabase = getSupabaseAdmin();
    const { data: order } = await supabase
      .from("ads_budget_orders")
      .select("id, provider_id, status")
      .eq("id", orderId)
      .maybeSingle();

    if (!order) return errorResponse("Order not found", "NOT_FOUND", 404);

    const providerId = String((order as { provider_id?: string }).provider_id ?? "");
    if (!providerId || !(await userHasProviderAccessAdmin(supabase, user.id, providerId))) {
      return errorResponse("You do not have access to this order", "FORBIDDEN", 403);
    }

    if (String((order as { status?: string }).status ?? "") !== "pending") {
      return errorResponse("Only pending orders can be abandoned", "VALIDATION", 409);
    }

    const result = await reverseAdsBudgetOrderPayment({
      supabase,
      orderId,
      finalOrderStatus: "failed",
      reason: "payment_abandoned",
    });

    return successResponse({
      abandoned: result.reversed || result.alreadyReversed,
      campaign_id: result.campaignId,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to abandon payment");
  }
}
