import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import { calculateStaffCommission } from "@/lib/payroll/commission-calculator";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);    const supabaseAdmin = createClient(
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


    const { data: providerData, error: providerError } = await supabaseAdmin
      .from('providers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (providerError || !providerData?.id) {
      return handleApiError(
        new Error('Provider profile not found'),
        'NOT_FOUND',
        404
      );
    }
    const searchParams = request.nextUrl.searchParams;
    const fromDate = searchParams.get("from")
      ? new Date(searchParams.get("from")!)
      : subDays(new Date(), 30);
    const toDate = searchParams.get("to")
      ? new Date(searchParams.get("to")!)
      : new Date();
    const staffIdFilter = searchParams.get("staff_id");

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
          toDate
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

    return successResponse({
      totalCommission,
      totalRevenue,
      averageCommissionRate,
      staffCommissions: sorted,
    });
  } catch (error) {
    return handleApiError(error, "COMMISSION_REPORT_ERROR", 500);
  }
}
