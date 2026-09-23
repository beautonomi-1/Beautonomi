import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { requireOpsDesk } from "@/lib/provider-ops/ops-desk-auth";
import {
  enrichRetentionCaseRow,
  fetchLastTouchByCaseIds,
  filterByTab,
} from "@/lib/provider-ops/retention-enrich";
import { ACTIVATION_SLA_DAYS_14, BROADCAST_TOUCH_SUPPRESS_DAYS, daysBetween } from "@/lib/provider-ops/retention-rules";

const CAP = 200;

export async function GET(request: NextRequest) {
  try {
    await requireOpsDesk(["retention"], request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const tab = new URL(request.url).searchParams.get("tab") ?? "";
    const churnFilter = new URL(request.url).searchParams.get("churn_reason") ?? "";
    const caseIdsParam = new URL(request.url).searchParams.get("case_ids") ?? "";

    let query = supabase
      .from("provider_ops_cases")
      .select("*, providers:provider_id ( id, business_name, status, user_id )")
      .eq("tenant_id", tenantId)
      .eq("current_desk", "retention");

    if (caseIdsParam) {
      const ids = caseIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
      query = query.in("id", ids.slice(0, CAP));
    } else if (tab === "no_booking") {
      query = query.eq("status", "activated").is("first_booking_at", null);
    } else if (tab === "one_and_done") {
      query = query.eq("status", "activated").eq("qualifying_booking_count", 1);
    } else if (tab === "inactive") {
      query = query.eq("status", "activated").gte("qualifying_booking_count", 2);
    } else if (tab === "churned") {
      query = query.eq("status", "churned");
      if (churnFilter === "involuntary") {
        query = query.in("churn_reason", ["chargeback", "dunning_exhausted"]);
      } else if (churnFilter === "cancelled_expired") {
        query = query.eq("churn_reason", "cancelled_expired");
      }
    } else {
      return errorResponse("Tab not supported for whole-tab broadcast", "VALIDATION_ERROR", 400);
    }

    const { data: rows, error } = await query.limit(CAP + 50);
    if (error) throw error;

    const ids = (rows ?? []).map((r) => r.id as string);
    const touchMap = await fetchLastTouchByCaseIds(supabase, ids);
    const nowMs = Date.now();

    const userIds: string[] = [];
    for (const row of rows ?? []) {
      const enriched = enrichRetentionCaseRow(
        row as Record<string, unknown>,
        touchMap.get(row.id as string) ?? null,
        nowMs,
      );

      if (tab === "no_booking") {
        const days = enriched.days_since_activation ?? 0;
        if (days < ACTIVATION_SLA_DAYS_14) continue;
      }
      if (tab === "one_and_done" && enriched.stage !== "one_and_done") continue;
      if (tab === "inactive" && !filterByTab(enriched, "inactive")) continue;

      const lastTouch = enriched.last_touch_at;
      if (lastTouch && daysBetween(lastTouch, nowMs) < BROADCAST_TOUCH_SUPPRESS_DAYS) continue;
      const snooze = enriched.next_follow_up_at as string | null;
      if (snooze && new Date(snooze).getTime() > nowMs) continue;

      const prov = enriched.providers as { user_id?: string | null } | null | undefined;
      if (prov?.user_id) userIds.push(prov.user_id);
      if (userIds.length >= CAP) break;
    }

    const unique = [...new Set(userIds)];
    return successResponse({
      user_ids: unique,
      provider_count: unique.length,
      cap_hit: unique.length >= CAP,
    });
  } catch (error) {
    return handleApiError(error, "Failed to resolve broadcast audience");
  }
}
