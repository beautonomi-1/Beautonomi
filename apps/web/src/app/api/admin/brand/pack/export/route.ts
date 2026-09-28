import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { resolveUtcPeriod } from "@/lib/brand-marketing/periods";
import { sumKnownSpendForTenant } from "@/lib/brand-marketing/metrics";

export async function GET(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const url = new URL(request.url);
    const preset = (url.searchParams.get("period") ?? "this_quarter") as Parameters<
      typeof resolveUtcPeriod
    >[0];
    const period = resolveUtcPeriod(preset);
    const supabase = getSupabaseAdmin();
    const spend = await sumKnownSpendForTenant(supabase, access.tenantId, period);

    const { data: bookings } = await supabase
      .from("bookings")
      .select("total_amount")
      .eq("tenant_id", access.tenantId)
      .eq("status", "completed")
      .gte("scheduled_at", period.start.toISOString())
      .lte("scheduled_at", period.end.toISOString());
    const gmv = (bookings ?? []).reduce((s, b) => s + Number(b.total_amount ?? 0), 0);

    const lines = [
      "metric,value,source,period_start,period_end",
      `known_spend,${spend.known},entered+estimated_owned,${period.start.toISOString().slice(0, 10)},${period.end.toISOString().slice(0, 10)}`,
      `gross_booking_value,${gmv},measured_completed_bookings,${period.start.toISOString().slice(0, 10)},${period.end.toISOString().slice(0, 10)}`,
      `period_efficiency,${spend.known > 0 ? gmv / spend.known : ""},not_incremental,${period.start.toISOString().slice(0, 10)},${period.end.toISOString().slice(0, 10)}`,
    ];

    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="brand-pack-${period.start.toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to export brand pack");
  }
}
