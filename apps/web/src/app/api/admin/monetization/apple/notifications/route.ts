import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/** GET /api/admin/monetization/apple/notifications */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const offset = (page - 1) * limit;

    const supabase = getSupabaseAdmin();
    const { data, error, count } = await supabase
      .from("apple_iap_transactions")
      .select(
        "id, transaction_id, original_transaction_id, product_id, transaction_type, purchase_date, environment, notification_uuid, attribution_status, created_at",
        { count: "exact" },
      )
      .not("notification_uuid", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return successResponse({
      items: data ?? [],
      meta: {
        page,
        limit,
        total: count ?? 0,
        has_more: (count ?? 0) > offset + limit,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
