import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays, format, eachDayOfInterval, startOfDay, endOfDay } from "date-fns";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { DASHBOARD_REVENUE_TRANSACTION_TYPES } from "@/lib/reports/constants";

/**
 * GET /api/provider/reports/weekly-revenue
 * Daily totals aligned with main dashboard revenue (provider_earnings only), same as `revenue_today` / `revenue_this_week`.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const locationId = searchParams.get("location_id");
    const startDate = searchParams.get("start_date")
      ? startOfDay(new Date(searchParams.get("start_date")!))
      : startOfDay(subDays(new Date(), 6));
    const endDate = searchParams.get("end_date")
      ? endOfDay(new Date(searchParams.get("end_date")!))
      : endOfDay(new Date());

    const { revenueByDate } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      startDate,
      endDate,
      locationId,
      { transactionTypes: DASHBOARD_REVENUE_TRANSACTION_TYPES },
    );

    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const result = days.map((d) => {
      const key = format(d, "yyyy-MM-dd");
      return {
        day: key,
        revenue: revenueByDate.get(key) ?? 0,
      };
    });

    return successResponse(result);
  } catch (error) {
    console.error("Error in weekly-revenue report:", error);
    return handleApiError(error, "Failed to generate weekly revenue report");
  }
}
