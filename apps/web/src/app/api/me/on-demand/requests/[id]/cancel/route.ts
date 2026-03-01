import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * POST /api/me/on-demand/requests/[id]/cancel
 * Cancel an on-demand request (customer, atomic).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("on_demand_requests")
      .update({ status: "cancelled", cancelled_at: now, updated_at: now })
      .eq("id", id)
      .eq("status", "requested")
      .gt("expires_at", now)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return errorResponse(
        "Request already handled or expired",
        "ALREADY_HANDLED_OR_EXPIRED",
        409
      );
    }
    return successResponse(data);
  } catch (error) {
    return handleApiError(error as Error, "Failed to cancel on-demand request");
  }
}
