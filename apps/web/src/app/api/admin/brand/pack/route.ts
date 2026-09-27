import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { resolveUtcPeriod, comparisonPeriod } from "@/lib/brand-marketing/periods";
import { loadBrandSettings } from "@/lib/brand-marketing/settings";
import { sumKnownSpendForTenant } from "@/lib/brand-marketing/metrics";
import { rollupTenantBrandPack } from "@/lib/brand-marketing/pack-rollup";

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
    const comparison = (url.searchParams.get("comparison") ?? "previous_period") as Parameters<
      typeof comparisonPeriod
    >[1];

    const supabase = getSupabaseAdmin();
    const settings = await loadBrandSettings(supabase, access.tenantId);
    const period = resolveUtcPeriod(preset);
    const compare = comparisonPeriod(period, comparison, settings.fiscal_year_start_month);

    const spend = await sumKnownSpendForTenant(supabase, access.tenantId, period);
    const spendCompare = compare
      ? await sumKnownSpendForTenant(supabase, access.tenantId, compare)
      : null;

    const { data: newCustomersPeriod } = await supabase.rpc(
      "admin_count_users_in_tenant_scope_created_between",
      {
        p_tenant_id: access.tenantId,
        p_role: "customer",
        p_created_at_min: period.start.toISOString(),
        p_created_at_max: period.end.toISOString(),
      },
    );
    let newCustomersCompare: number | null = null;
    if (compare) {
      const { data: compareCount } = await supabase.rpc(
        "admin_count_users_in_tenant_scope_created_between",
        {
          p_tenant_id: access.tenantId,
          p_role: "customer",
          p_created_at_min: compare.start.toISOString(),
          p_created_at_max: compare.end.toISOString(),
        },
      );
      newCustomersCompare = compareCount ?? 0;
    }

    const funnelRollup = await rollupTenantBrandPack(supabase, access.tenantId, period);

    const { data: snapshot } = await supabase
      .from("brand_period_snapshots")
      .select("*")
      .eq("tenant_id", access.tenantId)
      .eq("period_start", period.start.toISOString().slice(0, 10))
      .eq("period_end", period.end.toISOString().slice(0, 10))
      .maybeSingle();

    let bookingValue = 0;
    const { data: bookings } = await supabase
      .from("bookings")
      .select("total_amount")
      .eq("tenant_id", access.tenantId)
      .eq("status", "completed")
      .gte("scheduled_at", period.start.toISOString())
      .lte("scheduled_at", period.end.toISOString());
    bookingValue = (bookings ?? []).reduce((s, b) => s + Number(b.total_amount ?? 0), 0);

    const periodEfficiency =
      spend.known > 0
        ? {
            value: bookingValue / spend.known,
            label: "Period efficiency (not incremental)",
            gross_booking_value: bookingValue,
            known_spend: spend.known,
          }
        : { value: null, label: "Period efficiency (no spend)" };

    const newCustomers = newCustomersPeriod ?? 0;
    const spendDelta =
      spendCompare && spendCompare.known > 0
        ? Math.round(((spend.known - spendCompare.known) / spendCompare.known) * 1000) / 10
        : null;
    const signupDelta =
      newCustomersCompare != null && newCustomersCompare > 0
        ? Math.round(((newCustomers - newCustomersCompare) / newCustomersCompare) * 1000) / 10
        : null;

    return successResponse({
      period,
      compare,
      spend,
      spend_compare: spendCompare,
      platform: {
        new_customers: newCustomers,
        new_customers_compare: newCustomersCompare,
        label: "New customers in period (tenant scope)",
      },
      period_efficiency: periodEfficiency,
      funnel: funnelRollup,
      growth: {
        spend_change_pct: spendDelta,
        signup_change_pct: signupDelta,
        attributed_signups: funnelRollup.totals.attributed_signups,
        gross_booking_value: bookingValue,
      },
      snapshot,
      utc_note: "All period boundaries use UTC.",
    });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to load brand pack");
  }
}
