import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  notFoundResponse,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";
import { buildProviderActivityFeed } from "@/lib/provider/build-provider-activity-feed";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );

    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "10", 10), 50);
    const locationId = searchParams.get("location_id");

    const payload = await buildProviderActivityFeed(supabaseAdmin, providerId, {
      timezone: reportContext.timezone,
      locationId,
      limit,
    });

    return successResponse(payload);
  } catch (error) {
    console.error("Error in activity feed:", error);
    return handleApiError(error, "Failed to load activity feed");
  }
}
