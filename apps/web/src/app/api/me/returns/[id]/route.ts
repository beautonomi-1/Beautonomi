import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/returns/[id] — customer views a return request detail
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer();

    const { data, error } = await (supabase.from("product_return_requests") as any)
      .select(
        `*, order:product_orders(order_number, total_amount, fulfillment_type, provider:providers(id, business_name, slug))`,
      )
      .eq("id", id)
      .eq("customer_id", user.id)
      .single();

    if (error || !data) return notFoundResponse("Return request not found");
    return successResponse({ return_request: data });
  } catch (err) {
    return handleApiError(err, "Failed to fetch return request");
  }
}

/**
 * PATCH /api/me/returns/[id] — customer cancels or escalates
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const body = await request.json();
    const supabase = await getSupabaseServer();

    const { data: req } = await (supabase.from("product_return_requests") as any)
      .select("id, status, customer_id")
      .eq("id", id)
      .eq("customer_id", user.id)
      .single();

    if (!req) return notFoundResponse("Return request not found");

    const update: Record<string, unknown> = {};

    if (body.action === "cancel" && req.status === "pending") {
      update.status = "cancelled";
    } else if (body.action === "escalate" && req.status === "rejected") {
      update.status = "escalated";
      update.escalated_at = new Date().toISOString();
    } else {
      return errorResponse("Invalid action for current status", "INVALID_ACTION", 400);
    }

    const { data, error } = await (supabase.from("product_return_requests") as any)
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return successResponse({ return_request: data });
  } catch (err) {
    return handleApiError(err, "Failed to update return request");
  }
}
