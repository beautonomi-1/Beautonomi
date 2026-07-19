import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";

type Action = "confirm" | "dispute";

/**
 * POST /api/me/product-orders/[id]/refund-respond
 * Customer confirms or disputes a provider-recorded in-person (cash) product
 * order refund. Parity with the booking cash-refund confirmation flow — no
 * money moves here (cash was handed back in person); this records the customer
 * acknowledgement / dispute for audit + support triage.
 * @tenant-hint Service-role read/update is scoped with .eq("customer_id", user.id) after customer auth.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: orderId } = await params;
    const { user } = await requireRoleInApi(["customer"], request);
    const body = await request.json().catch(() => ({}));
    const action = (body?.action as Action) ?? "confirm";

    const supabaseAdmin = getSupabaseAdmin();

    // Read via admin (mirrors GET /api/me/orders/[id]) then enforce ownership
    // with the customer_id filter — customer RLS on product_orders is
    // restrictive and would otherwise hide the row.
    const { data: order } = await (supabaseAdmin.from("product_orders") as any)
      .select(
        "id, customer_id, status, refund_method, refund_customer_confirmation_required, refund_customer_confirmed_at, refund_customer_disputed_at, order_number",
      )
      .eq("id", orderId)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (!order) {
      return errorResponse("Order not found", "NOT_FOUND", 404);
    }

    if (!order.refund_customer_confirmation_required) {
      return errorResponse("This order has no refund awaiting confirmation.", "INVALID_STATUS", 400);
    }
    if (order.refund_customer_confirmed_at || order.refund_customer_disputed_at) {
      return errorResponse("This refund has already been responded to.", "ALREADY_RESPONDED", 400);
    }

    if (action === "dispute") {
      await (supabaseAdmin.from("product_orders") as any)
        .update({
          refund_customer_disputed_at: new Date().toISOString(),
        })
        .eq("id", orderId);
      return successResponse({ message: "Refund disputed. Our team will review." });
    }

    await (supabaseAdmin.from("product_orders") as any)
      .update({
        refund_customer_confirmed_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    return successResponse({ message: "Refund confirmed" });
  } catch (error) {
    return handleApiError(error, "Failed to respond to refund");
  }
}
