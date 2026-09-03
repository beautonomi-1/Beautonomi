import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { createClient } from "@supabase/supabase-js";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";
import { calculateStaffCommission } from "@/lib/payroll/commission-calculator";

export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { fromDate, toDate } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });
    const staffIdFilter = searchParams.get("staff_id");
    const locationId = searchParams.get("location_id") || undefined;

    // Get staff members
    let staffQuery = supabaseAdmin
      .from("provider_staff")
      .select(
        `
        id,
        user_id,
        service_commission_rate,
        product_commission_rate,
        commission_rate,
        commission_enabled,
        users (
          full_name
        )
      `
      )
      .eq("provider_id", providerId)
      .eq("is_active", true);

    if (staffIdFilter) {
      staffQuery = staffQuery.eq("id", staffIdFilter);
    }

    const { data: staffMembers, error: staffError } = await staffQuery;

    if (staffError) {
      return handleApiError(
        new Error("Failed to fetch staff"),
        "STAFF_FETCH_ERROR",
        500
      );
    }

    const commissionData = await Promise.all(
      (staffMembers || []).map(async (staff) => {
        const commission = await calculateStaffCommission(
          supabaseAdmin,
          providerId,
          staff.id,
          fromDate,
          toDate,
          locationId
        );

        const serviceRate = staff.service_commission_rate ?? staff.commission_rate ?? 0;
        const productRate = staff.product_commission_rate ?? staff.commission_rate ?? 0;
        const displayRate = serviceRate || productRate || 0;

        return {
          staffId: staff.id,
          staffName: (staff.users as any)?.full_name || "Unknown",
          commissionRate: displayRate,
          totalBookings: commission.totalBookings,
          totalRevenue: commission.totalRevenue,
          totalCommission: commission.totalCommission,
          averageCommission:
            commission.totalBookings > 0
              ? commission.totalCommission / commission.totalBookings
              : 0,
        };
      })
    );

    const sorted = commissionData.sort((a, b) => b.totalCommission - a.totalCommission);

    const totalCommission = sorted.reduce((sum, s) => sum + s.totalCommission, 0);
    const totalRevenue = sorted.reduce((sum, s) => sum + s.totalRevenue, 0);
    const averageCommissionRate = sorted.length > 0
      ? sorted.reduce((sum, s) => sum + s.commissionRate, 0) / sorted.length
      : 0;

    const enabledStaff = (staffMembers || []).filter(
      (s: { commission_enabled?: boolean | null }) => s.commission_enabled === true,
    );
    const { data: disabledServices } = await supabaseAdmin
      .from("offerings")
      .select("id")
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .eq("team_member_commission_enabled", false)
      .is("parent_service_id", null);
    const zeroCommissionServiceWarning =
      enabledStaff.length > 0 && (disabledServices?.length ?? 0) > 0
        ? `${enabledStaff.length} staff have commission enabled, but ${disabledServices?.length ?? 0} active services have staff commission turned off.`
        : null;

    return successResponse({
      totalCommission,
      totalRevenue,
      averageCommissionRate,
      staffCommissions: sorted,
      zeroCommissionServiceWarning,
    });
  } catch (error) {
    return handleApiError(error, "COMMISSION_REPORT_ERROR", 500);
  }
}
