import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  handleApiError,
  notFoundResponse,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { refreshTrackingForOrder } from "@/lib/orders/shipping";

/**
 * GET /api/me/orders/[id]/tracking
 * Customer-facing live tracking for a product order they own.
 * @tenant-hint Service-role read is scoped with customer_id = user.id (superadmin excepted).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = getSupabaseAdmin();
    const result = await refreshTrackingForOrder(supabase, id, {
      customerId: user.role === "superadmin" ? undefined : user.id,
    });
    if (!result.ok && result.error === "order_not_found") {
      return notFoundResponse("Order not found");
    }
    return successResponse(result);
  } catch (err) {
    return handleApiError(err, "Failed to load tracking");
  }
}
