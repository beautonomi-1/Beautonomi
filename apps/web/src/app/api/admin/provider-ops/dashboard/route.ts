import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  fetchAllPaged,
  chunkIds,
  unwrapEmbedded,
} from "@/lib/provider-ops/postgrest-unbounded";
import { PROVIDER_LEAD_PIPELINE_STAGES } from "@/lib/provider-ops/lead-pipeline-stages";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const now = Date.now();
    const stallThresholdMs = 24 * 60 * 60 * 1000;
    const dropOffThresholdMs = 7 * 24 * 60 * 60 * 1000;
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    const rawDrafts = await fetchAllPaged<Record<string, unknown>>(async (from, to) => {
      const r = await supabase
        .from("provider_onboarding_drafts")
        .select("user_id, current_step, updated_at, created_at, users!inner(tenant_id, role)")
        .eq("users.tenant_id", tenantId)
        .range(from, to);
      return { data: r.data as Record<string, unknown>[] | null, error: r.error };
    });

    const drafts = rawDrafts.filter((d) => {
      const u = unwrapEmbedded<{ role?: string }>(d, "users");
      return u?.role === "provider_owner";
    });

    const [
      pendingRes,
      activeRes,
      totalLeadsHead,
      leadsWeekHead,
      stageCountRows,
      recentActivitiesRes,
    ] = await Promise.all([
      supabase
        .from("providers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", ["draft", "pending_approval"]),
      supabase
        .from("providers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "active"),
      supabase
        .from("provider_leads")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      supabase
        .from("provider_leads")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", weekAgo),
      Promise.all(
        PROVIDER_LEAD_PIPELINE_STAGES.map(async (stage) => {
          const { count, error } = await supabase
            .from("provider_leads")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("commercial_stage", stage);
          if (error) throw error;
          return [stage, count ?? 0] as const;
        })
      ),
      supabase
        .from("provider_lead_activities")
        .select(
          "id, lead_id, activity_type, description, created_at, performed_by, provider_leads!inner(tenant_id)"
        )
        .eq("provider_leads.tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const leadsByStage: Record<string, number> = {};
    for (const [stage, c] of stageCountRows) {
      leadsByStage[stage] = c;
    }

    const { data: recentActivities } = recentActivitiesRes;
    if (recentActivitiesRes.error) throw recentActivitiesRes.error;

    const completedUserIds = new Set<string>();

    if (drafts.length > 0) {
      const draftUserIds = drafts.map((d) => String(d.user_id));
      for (const chunk of chunkIds(draftUserIds, 120)) {
        const { data: providers, error: pErr } = await supabase
          .from("providers")
          .select("user_id")
          .eq("tenant_id", tenantId)
          .in("user_id", chunk);
        if (pErr) throw pErr;
        for (const p of providers || []) {
          completedUserIds.add(p.user_id as string);
        }
      }
    }

    let stalledCount = 0;
    let droppedOffCount = 0;
    let signupsToday = 0;
    let signupsThisWeek = 0;

    for (const draft of drafts) {
      const d = draft as { user_id: string; updated_at: string };
      if (completedUserIds.has(String(d.user_id))) continue;
      const diff = now - new Date(d.updated_at).getTime();
      if (diff > dropOffThresholdMs) droppedOffCount++;
      else if (diff > stallThresholdMs) stalledCount++;
    }

    for (const draft of drafts) {
      const d = draft as { user_id: string; created_at: string };
      if (completedUserIds.has(String(d.user_id))) continue;
      const created = new Date(d.created_at).getTime();
      if (created > now - 24 * 60 * 60 * 1000) signupsToday++;
      if (created > now - 7 * 24 * 60 * 60 * 1000) signupsThisWeek++;
    }

    return successResponse({
      urgent: {
        stalled_signups: stalledCount,
        dropped_off: droppedOffCount,
        pending_approval: pendingRes.count || 0,
      },
      kpis: {
        signups_today: signupsToday,
        signups_this_week: signupsThisWeek,
        leads_this_week: leadsWeekHead.count ?? 0,
        active_providers: activeRes.count || 0,
        total_leads: totalLeadsHead.count ?? 0,
      },
      pipeline: leadsByStage,
      recent_activities: recentActivities ?? [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch dashboard");
  }
}
