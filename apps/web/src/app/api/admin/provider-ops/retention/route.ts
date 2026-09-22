import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { requireOpsDesk } from "@/lib/provider-ops/ops-desk-auth";
import { stampFirstBookingAtIfNeeded } from "@/lib/provider-ops/ops-case";
import { getProviderCompletedBookingTrend } from "@/lib/provider-ops/provider-booking-trend";

const VALID_TABS = ["active", "churned", "no_booking", "at_risk"] as const;
type RetentionTab = (typeof VALID_TABS)[number];

function parseTab(raw: string | null): RetentionTab {
  if (raw && (VALID_TABS as readonly string[]).includes(raw)) {
    return raw as RetentionTab;
  }
  return "active";
}

export async function GET(request: NextRequest) {
  try {
    await requireOpsDesk(["retention"], request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const tab = parseTab(new URL(request.url).searchParams.get("tab"));

    let query = supabase
      .from("provider_ops_cases")
      .select(
        "*, providers:provider_id ( id, business_name, status )",
      )
      .eq("tenant_id", tenantId)
      .eq("current_desk", "retention");

    if (tab === "churned") {
      query = query.eq("status", "churned");
    } else if (tab === "no_booking") {
      query = query.eq("status", "activated").is("first_booking_at", null);
    } else if (tab === "at_risk") {
      query = query
        .eq("status", "activated")
        .is("at_risk_saved_at", null)
        .not("provider_id", "is", null);
    } else {
      query = query.in("status", ["open", "activated"]);
    }

    const { data: rawCases, error } = await query
      .order("updated_at", { ascending: false })
      .limit(tab === "at_risk" ? 200 : 100);
    if (error) throw error;

    let cases = rawCases ?? [];

    if (tab === "at_risk") {
      const atRisk: typeof cases = [];
      for (const row of cases) {
        const providerId = (row as { provider_id?: string | null }).provider_id;
        if (!providerId) continue;
        const trend = await getProviderCompletedBookingTrend(supabase, providerId);
        if (!trend.concerning) continue;
        atRisk.push({
          ...row,
          booking_trend: trend,
        });
        if (atRisk.length >= 100) break;
      }
      cases = atRisk;
    } else {
      for (const row of cases) {
        const providerId = (row as { provider_id?: string | null }).provider_id;
        if (providerId) {
          await stampFirstBookingAtIfNeeded(supabase, (row as { id: string }).id, providerId);
        }
      }
    }

    return successResponse({ tab, cases });
  } catch (error) {
    return handleApiError(error, "Failed to load retention queue");
  }
}
