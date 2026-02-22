import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, getPaginationParams } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/broadcast/history
 * 
 * Get broadcast history
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);
    const supabase = await getSupabaseServer();

    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = getPaginationParams(request);

    const channel = searchParams.get("channel");
    const recipientType = searchParams.get("recipient_type");

    let query = supabase
      .from("broadcast_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (channel && channel !== "all") {
      query = query.eq("channel", channel);
    }

    if (recipientType && recipientType !== "all") {
      query = query.eq("recipient_type", recipientType);
    }

    const { data: broadcasts, error, count } = await query
      .range(offset, offset + limit - 1);

    if (error) {
      return handleApiError(error, "Failed to fetch broadcast history");
    }

    return successResponse({
      broadcasts: broadcasts || [],
      meta: {
        page,
        limit,
        total: count || 0,
        has_more: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch broadcast history");
  }
}
