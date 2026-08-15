import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  handleApiError,
  notFoundResponse,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { refreshTrackingForOrder } from "@/lib/orders/shipping";

/**
 * GET /api/provider/product-orders/[id]/tracking
 * Live courier tracking when the order has a known carrier + tracking number.
 * Manual tracking numbers are returned as stored, without inventing events.
 * @tenant-hint scoped by provider_id from getProviderIdForUser
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const permissionCheck = await requirePermission("view_sales", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const result = await refreshTrackingForOrder(supabase, id, { providerId });
    if (!result.ok && result.error === "order_not_found") {
      return notFoundResponse("Order not found");
    }
    return successResponse(result);
  } catch (err) {
    return handleApiError(err, "Failed to load tracking");
  }
}
