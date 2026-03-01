import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/account-status
 * 
 * Get current user's account status (suspended, deactivated, etc.)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    if (!user) {
      return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await getSupabaseServer();

    // Check if user is deactivated
    const { data: userData } = await supabase
      .from("users")
      .select("deactivated_at, deactivated_by, role")
      .eq("id", user.id)
      .single();

    if (userData?.deactivated_at) {
      return successResponse({
        is_deactivated: true,
        deactivated_at: userData.deactivated_at,
        deactivated_by: userData.deactivated_by || null,
      });
    }

    // Check if provider is suspended
    if (userData?.role === "provider_owner" || userData?.role === "provider_staff") {
      const { data: provider } = await supabase
        .from("providers")
        .select("id, status, status_reason, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (provider && provider.status === "suspended") {
        return successResponse({
          is_suspended: true,
          suspension_reason: provider.status_reason || "Your account has been suspended. Please contact support for more information.",
          suspended_at: provider.updated_at,
          provider_id: provider.id,
        });
      }
    }

    return successResponse({
      is_suspended: false,
      is_deactivated: false,
    });
  } catch (error) {
    return handleApiError(error, "Failed to get account status");
  }
}
