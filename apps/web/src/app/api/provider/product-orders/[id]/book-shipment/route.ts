import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  handleApiError,
  notFoundResponse,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { bookShippingForOrder } from "@/lib/orders/shipping";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("view_sales", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: order } = await (supabase.from("product_orders") as any)
      .select("id, provider_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!order) return notFoundResponse("Order not found");

    const result = await bookShippingForOrder(supabase, id);
    return successResponse({ result });
  } catch (err) {
    return handleApiError(err, "Failed to book courier shipment");
  }
}
