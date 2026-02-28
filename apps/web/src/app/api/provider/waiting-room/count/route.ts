import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/waiting-room/count
 *
 * Returns the number of entries currently in the waiting room (checked in, not yet started).
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("view_calendar", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { count, error } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .in("status", ["waiting", "checked_in", "confirmed"])
      .not("checked_in_time", "is", null);

    if (error) {
      // If column or enum not yet migrated (e.g. missing checked_in_time), return 0 so app does not 500
      const code = (error as { code?: string })?.code;
      if (code === "42703" /* undefined_column */ || code === "22P02" /* invalid_text_representation e.g. enum */) {
        return successResponse({ count: 0 });
      }
      throw error;
    }

    return successResponse({ count: count ?? 0 });
  } catch (error) {
    return handleApiError(error, "Failed to fetch waiting room count");
  }
}
