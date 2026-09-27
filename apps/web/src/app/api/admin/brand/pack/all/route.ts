import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse, requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { resolveUtcPeriod } from "@/lib/brand-marketing/periods";
import { sumKnownSpendForTenant } from "@/lib/brand-marketing/metrics";
import { convertAmount } from "@/lib/brand-marketing/fx";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);
    if (String(user.role).toLowerCase() !== "superadmin") {
      return errorResponse("Superadmin only", "FORBIDDEN", 403);
    }

    const url = new URL(request.url);
    const preset = (url.searchParams.get("period") ?? "this_quarter") as Parameters<
      typeof resolveUtcPeriod
    >[0];
    const period = resolveUtcPeriod(preset);
    const reporting = "ZAR";
    const asOf = period.end.toISOString().slice(0, 10);

    const supabase = getSupabaseAdmin();
    const { data: tenants } = await supabase.from("tenants").select("id, slug, name, default_currency").eq("is_active", true);

    const rows = [];
    let totalKnown = 0;
    let totalBooking = 0;

    for (const t of tenants ?? []) {
      const spend = await sumKnownSpendForTenant(supabase, t.id, period);
      const { data: bookings } = await supabase
        .from("bookings")
        .select("total_amount")
        .eq("tenant_id", t.id)
        .eq("status", "completed")
        .gte("scheduled_at", period.start.toISOString())
        .lte("scheduled_at", period.end.toISOString());
      const bookingValue = (bookings ?? []).reduce((s, b) => s + Number(b.total_amount ?? 0), 0);

      const fxSpend = await convertAmount(supabase, spend.known, t.default_currency ?? "ZAR", reporting, asOf);
      const fxBooking = await convertAmount(supabase, bookingValue, t.default_currency ?? "ZAR", reporting, asOf);

      const knownZar = fxSpend.converted ?? 0;
      const bookingZar = fxBooking.converted ?? 0;
      totalKnown += knownZar;
      totalBooking += bookingZar;

      rows.push({
        tenant_id: t.id,
        slug: t.slug,
        name: t.name,
        known_spend_zar: knownZar,
        gross_booking_value_zar: bookingZar,
        converted_at: asOf,
        missing_fx: fxSpend.missingRate || fxBooking.missingRate,
      });
    }

    return successResponse({
      period,
      reporting_currency: reporting,
      markets: rows,
      totals: {
        known_spend_zar: totalKnown,
        gross_booking_value_zar: totalBooking,
        roas: totalKnown > 0 ? totalBooking / totalKnown : null,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to load all-markets brand pack");
  }
}
