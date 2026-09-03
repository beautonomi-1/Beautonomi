import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getCalendarScopeForUser } from "@/lib/auth/calendar-scope";
import { resolveProviderStaffRowId } from "@/lib/provider/resolve-provider-staff-id";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const permissionCheck = await requirePermission("view_team", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const { id } = await params;

    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const resolvedStaffId = await resolveProviderStaffRowId(supabaseAdmin, providerId, id);
    if (!resolvedStaffId) return notFoundResponse("Staff member not found");

    const { scope, staffId: selfStaffId } = await getCalendarScopeForUser(user.id, request);
    if (scope === "own" && selfStaffId && resolvedStaffId !== selfStaffId) {
      return errorResponse(
        "You can only view your own bookings",
        "FORBIDDEN",
        403,
      );
    }

    const effectiveTenantId =
      (await supabaseAdmin.from("providers").select("tenant_id").eq("id", providerId).maybeSingle())
        .data?.tenant_id ?? (await resolveTenantIdWithZaFallback(request));
    const tenantRegion = await getTenantRegionConfig(effectiveTenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const sp = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(sp.get("limit") || "10", 10), 50);

    const { data: bookingServiceIds } = await supabaseAdmin
      .from("booking_services")
      .select("booking_id")
      .eq("staff_id", resolvedStaffId);

    const bookingIds = [...new Set((bookingServiceIds || []).map((bs: { booking_id: string }) => bs.booking_id))];

    if (bookingIds.length === 0) {
      return successResponse([]);
    }

    const { data: bookings } = await supabaseAdmin
      .from("bookings")
      .select(`
        id, booking_number, status, scheduled_at, total_amount, currency,
        customers:customer_id(full_name),
        booking_services(offerings:offering_id(title))
      `)
      .eq("provider_id", providerId)
      .in("id", bookingIds)
      .order("scheduled_at", { ascending: false })
      .limit(limit);

    const result = (bookings || []).map((b: any) => ({
      id: b.id,
      booking_number: b.booking_number,
      status: b.status,
      scheduled_at: b.scheduled_at,
      customer_name: b.customers?.full_name || "Walk-in",
      service_names: (b.booking_services || []).map((bs: any) => bs.offerings?.title || "Service").filter(Boolean),
      total_amount: Number(b.total_amount || 0),
      currency: b.currency || lastResortCurrency,
    }));

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to load staff bookings");
  }
}
