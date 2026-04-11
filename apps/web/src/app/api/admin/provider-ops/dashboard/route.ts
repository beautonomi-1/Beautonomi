import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const now = Date.now();
    const stallThresholdMs = 24 * 60 * 60 * 1000;
    const dropOffThresholdMs = 7 * 24 * 60 * 60 * 1000;
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: tenantUsers } = await supabase
      .from("users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("role", "provider_owner");
    const tenantUserIds = (tenantUsers || []).map((u: { id: string }) => u.id);

    const [
      draftsRes,
      leadsRes,
      pendingRes,
      activeRes,
      recentLeadsRes,
      recentActivitiesRes,
    ] = await Promise.all([
      supabase
        .from("provider_onboarding_drafts")
        .select("user_id, current_step, updated_at, created_at")
        .in("user_id", tenantUserIds.length > 0 ? tenantUserIds : ["__none__"]),
      supabase
        .from("provider_leads")
        .select("id, commercial_stage, source, created_at")
        .eq("tenant_id", tenantId),
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
        .select("id")
        .eq("tenant_id", tenantId)
        .gte("created_at", weekAgo),
      supabase
        .from("provider_lead_activities")
        .select(
          "id, lead_id, activity_type, description, created_at, performed_by"
        )
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const drafts = draftsRes.data || [];
    const completedUserIds = new Set<string>();

    if (drafts.length > 0) {
      const draftUserIds = drafts.map(
        (d: { user_id: string }) => d.user_id
      );
      const { data: providers } = await supabase
        .from("providers")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .in("user_id", draftUserIds);
      for (const p of providers || []) {
        completedUserIds.add(p.user_id as string);
      }
    }

    let stalledCount = 0;
    let droppedOffCount = 0;
    let signupsToday = 0;
    let signupsThisWeek = 0;

    for (const draft of drafts) {
      const d = draft as { user_id: string; updated_at: string };
      if (completedUserIds.has(d.user_id)) continue;
      const diff = now - new Date(d.updated_at).getTime();
      if (diff > dropOffThresholdMs) droppedOffCount++;
      else if (diff > stallThresholdMs) stalledCount++;
    }

    for (const draft of drafts) {
      const d = draft as { user_id: string; created_at: string };
      if (completedUserIds.has(d.user_id)) continue;
      const created = new Date(d.created_at).getTime();
      if (created > now - 24 * 60 * 60 * 1000) signupsToday++;
      if (created > now - 7 * 24 * 60 * 60 * 1000) signupsThisWeek++;
    }

    // Lead pipeline counts
    const leads = leadsRes.data || [];
    const leadsByStage: Record<string, number> = {};
    for (const lead of leads) {
      const stage = (lead as { commercial_stage: string }).commercial_stage;
      leadsByStage[stage] = (leadsByStage[stage] || 0) + 1;
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
        leads_this_week: recentLeadsRes.data?.length || 0,
        active_providers: activeRes.count || 0,
        total_leads: leads.length,
      },
      pipeline: leadsByStage,
      recent_activities: recentActivitiesRes.data || [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch dashboard");
  }
}
