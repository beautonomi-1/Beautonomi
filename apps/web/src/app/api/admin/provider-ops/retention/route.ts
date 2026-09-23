import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { requireOpsDesk } from "@/lib/provider-ops/ops-desk-auth";
import { getProviderCompletedBookingTrend } from "@/lib/provider-ops/provider-booking-trend";
import {
  enrichRetentionCaseRow,
  fetchLastTouchByCaseIds,
  filterByTab,
  isOnWorkingListExtended,
  sortWorkingList,
  type EnrichedRetentionCase,
} from "@/lib/provider-ops/retention-enrich";
import {
  fetchWeeklyCompletedBookingCountsByProvider,
  isWeeklyBookingFrequencyFalling,
} from "@/lib/provider-ops/provider-booking-trend";

const VALID_TABS = [
  "active",
  "churned",
  "no_booking",
  "one_and_done",
  "inactive",
  "at_risk",
] as const;
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
    const url = new URL(request.url);
    const tab = parseTab(url.searchParams.get("tab"));
    const scope = url.searchParams.get("scope") === "all" ? "all" : "working";

    let query = supabase
      .from("provider_ops_cases")
      .select(
        "*, providers:provider_id ( id, business_name, status, user_id )",
      )
      .eq("tenant_id", tenantId)
      .eq("current_desk", "retention");

    if (tab === "churned") {
      query = query.eq("status", "churned");
    } else if (tab === "at_risk") {
      query = query.eq("status", "activated").not("provider_id", "is", null);
    } else if (tab === "no_booking") {
      query = query.eq("status", "activated").is("first_booking_at", null);
    } else if (tab === "one_and_done" || tab === "inactive") {
      query = query.eq("status", "activated").gt("qualifying_booking_count", 0);
    } else {
      query = query.in("status", ["open", "activated"]);
    }

    const { data: rawCases, error } = await query
      .order("updated_at", { ascending: false })
      .limit(tab === "at_risk" ? 200 : 150);
    if (error) throw error;

    let rows = rawCases ?? [];
    if (tab === "active" && scope === "working") {
      const { data: churnRows } = await supabase
        .from("provider_ops_cases")
        .select(
          "*, providers:provider_id ( id, business_name, status, user_id )",
        )
        .eq("tenant_id", tenantId)
        .eq("current_desk", "retention")
        .eq("status", "churned")
        .lt("winback_step", 2)
        .order("updated_at", { ascending: false })
        .limit(80);
      const seen = new Set(rows.map((r) => r.id as string));
      for (const row of churnRows ?? []) {
        const id = row.id as string;
        if (!seen.has(id)) {
          seen.add(id);
          rows.push(row);
        }
      }
    }

    const caseIds = rows.map((r) => r.id as string);
    const lastTouchMap = await fetchLastTouchByCaseIds(supabase, caseIds);

    let enriched: EnrichedRetentionCase[] = rows.map((row) =>
      enrichRetentionCaseRow(
        row as Record<string, unknown>,
        lastTouchMap.get(row.id as string) ?? null,
      ),
    );

    if (tab === "one_and_done") {
      enriched = enriched.filter((c) => filterByTab(c, "one_and_done"));
    } else if (tab === "inactive") {
      enriched = enriched.filter((c) => filterByTab(c, "inactive"));
    }

    if (tab === "at_risk") {
      const atRisk: EnrichedRetentionCase[] = [];
      for (const row of enriched) {
        const flagged = Boolean(row.at_risk_flagged_at) && !row.at_risk_saved_at;
        let concerning = flagged;
        let booking_trend: unknown = undefined;
        const providerId = row.provider_id as string | null;
        if (providerId) {
          const trend = await getProviderCompletedBookingTrend(supabase, providerId);
          booking_trend = trend;
          if (trend.concerning) concerning = true;
        }
        if (!concerning) continue;
        atRisk.push({ ...row, booking_trend });
        if (atRisk.length >= 100) break;
      }
      enriched = atRisk;
    } else if (tab === "active" && scope === "working") {
      const providerIds = [
        ...new Set(
          enriched
            .map((c) => c.provider_id as string | null)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const weeklyCounts = await fetchWeeklyCompletedBookingCountsByProvider(
        supabase,
        tenantId,
        providerIds,
      );
      enriched = enriched.map((c) => {
        const pid = c.provider_id as string | null;
        if (!pid) return c;
        const w = weeklyCounts.get(pid);
        const weekly_bookings_falling = w
          ? isWeeklyBookingFrequencyFalling(w)
          : false;
        return { ...c, weekly_bookings_falling };
      });
      enriched = enriched.filter((c) => isOnWorkingListExtended(c)).sort(sortWorkingList).slice(0, 100);
    }

    return successResponse({ tab, scope, cases: enriched });
  } catch (error) {
    return handleApiError(error, "Failed to load retention queue");
  }
}
