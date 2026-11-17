import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { canViewStaffPay } from "@/lib/auth/provider-team-roster-access";
import { resolveStaffRates } from "@/lib/payroll/resolve-staff-rates";

/**
 * GET /api/provider/staff/onboarding-checklist?staff_id=
 * Owner/manager checklist for onboarding a team member.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const staffId = request.nextUrl.searchParams.get("staff_id");
    if (!staffId) {
      return handleApiError(new Error("staff_id required"), "VALIDATION_ERROR", 400);
    }

    const { data: staff } = await supabaseAdmin
      .from("provider_staff")
      .select(
        "id, user_id, invite_accepted_at, is_service_provider, commission_enabled, service_commission_rate, product_commission_rate, commission_rate, commission_percentage, time_clock_enabled, time_clock_pin",
      )
      .eq("id", staffId)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (!staff) return notFoundResponse("Staff not found");

    const payVisible =
      user.role === "superadmin" ||
      staff.user_id === user.id ||
      (await canViewStaffPay(user.id, request));
    if (!payVisible) return notFoundResponse("Staff not found");

    const [{ count: locCount }, { count: svcCount }, { data: schedule }] = await Promise.all([
      supabaseAdmin
        .from("provider_staff_locations")
        .select("id", { count: "exact", head: true })
        .eq("staff_id", staffId),
      supabaseAdmin
        .from("staff_services")
        .select("staff_id", { count: "exact", head: true })
        .eq("staff_id", staffId),
      supabaseAdmin
        .from("staff_schedules")
        .select("id")
        .eq("staff_id", staffId)
        .limit(1),
    ]);

    const isServiceProvider = (staff as { is_service_provider?: boolean | null }).is_service_provider !== false;

    const rates = resolveStaffRates(staff);
    const commissionConfigured =
      staff.commission_enabled === false || rates.serviceRate > 0 || rates.productRate > 0;

    const items = [
      { key: "invite_accepted", done: Boolean(staff.invite_accepted_at) },
      { key: "locations_assigned", done: (locCount ?? 0) > 0 },
      ...(isServiceProvider
        ? [
            { key: "services_assigned", done: (svcCount ?? 0) > 0 },
          ]
        : []),
      { key: "schedule_set", done: (schedule?.length ?? 0) > 0 },
      {
        key: "commission_configured",
        done: commissionConfigured,
      },
      {
        key: "time_clock_ready",
        done:
          staff.time_clock_enabled !== true ||
          Boolean(staff.time_clock_pin),
      },
    ];

    return successResponse({
      staff_id: staffId,
      items,
      complete: items.every((i) => i.done),
    });
  } catch (error) {
    return handleApiError(error, "Failed to load onboarding checklist");
  }
}
