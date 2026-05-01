import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import { dateRangeBoundsUtc, formatDateYmd, formatInTz, nowInTz } from "@/lib/dates/provider-tz";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const tz = reportContext.timezone;

    const zEnd = nowInTz(tz);
    const fromYmd = formatDateYmd(subDays(zEnd, 6), tz);
    const toYmd = formatDateYmd(zEnd, tz);
    const { fromIso, toIso } = dateRangeBoundsUtc(fromYmd, toYmd, tz);

    const { data: bookingServiceIds } = await supabaseAdmin
      .from("booking_services")
      .select("booking_id")
      .eq("staff_id", id);

    const bookingIds = [...new Set((bookingServiceIds || []).map((bs: any) => bs.booking_id))];

    const orderedYmds = Array.from({ length: 7 }, (_, i) => formatDateYmd(subDays(zEnd, 6 - i), tz));
    const dayMap = new Map<string, number>();
    orderedYmds.forEach((ymd) => dayMap.set(ymd, 0));

    if (bookingIds.length > 0) {
      const { data: bookings } = await supabaseAdmin
        .from("bookings")
        .select("scheduled_at")
        .eq("provider_id", providerId)
        .in("id", bookingIds)
        .gte("scheduled_at", fromIso)
        .lte("scheduled_at", toIso)
        .not("status", "in", "(cancelled,no_show)");

      (bookings || []).forEach((b: any) => {
        const day = formatInTz(new Date(b.scheduled_at), "yyyy-MM-dd", tz);
        dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
      });
    }

    const result = orderedYmds.map((day) => ({
      day,
      count: dayMap.get(day) ?? 0,
    }));

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to load staff weekly stats");
  }
}
