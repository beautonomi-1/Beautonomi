import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { chunkIds, unwrapEmbedded } from "@/lib/provider-ops/postgrest-unbounded";
import { fetchProviderOnboardingDraftsForTenantScope } from "@/lib/provider-ops/scoped-onboarding-drafts";
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

    const rawDrafts = await fetchProviderOnboardingDraftsForTenantScope(
      "user_id, current_step, updated_at, created_at, users!inner(role)",
      tenantId
    );

    const drafts = rawDrafts.filter((d) => {
      const u = unwrapEmbedded<{ role?: string }>(d, "users");
      return u?.role === "provider_owner";
    });

    const [
      pendingRes,
      draftRes,
      activeRes,
      totalLeadsHead,
      leadsWeekHead,
      stageCountRows,
      recentActivitiesRes,
      duplicateScanRes,
    ] = await Promise.all([
      // Truly submitted and awaiting review (the urgent signal).
      supabase
        .from("providers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending_approval"),
      // Incomplete provider records still being built — informational, not urgent.
      supabase
        .from("providers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "draft"),
      supabase
        .from("providers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "active"),
      supabase
        .from("provider_leads")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .is("deleted_at", null),
      supabase
        .from("provider_leads")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .gte("created_at", weekAgo),
      Promise.all(
        PROVIDER_LEAD_PIPELINE_STAGES.map(async (stage) => {
          const { count, error } = await supabase
            .from("provider_leads")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .is("deleted_at", null)
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
      /**
       * §Release-audit 2026-04: surface duplicate-lead pressure as an urgent
       * signal on the hub. Selects a small projection so the dashboard stays
       * fast — the real grouping logic lives in /api/admin/provider-ops/duplicates.
       */
      supabase
        .from("provider_leads")
        .select("id, email, phone_e164")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .is("matched_provider_id", null)
        .not("commercial_stage", "eq", "lost")
        .order("created_at", { ascending: false })
        .limit(5000),
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

    /**
     * §Release-audit 2026-04: estimate duplicate-lead pressure cheaply.
     * Count (a) groups with 2+ leads sharing email or phone and
     * (b) leads whose email/phone matches an existing provider/owner.
     * Uses a 9-digit phone tail to tolerate national vs E.164 formats.
     */
    const normEmail = (e: string | null | undefined) =>
      e?.trim() ? e.trim().toLowerCase() : null;
    const normPhone = (p: string | null | undefined) => {
      if (!p?.trim()) return null;
      const cleaned = p.trim().replace(/[\s\-().]/g, "").replace(/^00/, "+");
      if (!cleaned) return null;
      const digits = cleaned.replace(/\D/g, "");
      return digits.length >= 9 ? digits.slice(-9) : digits;
    };

    const leadRowsForDup = duplicateScanRes.data ?? [];
    const emailBuckets = new Map<string, number>();
    const phoneBuckets = new Map<string, number>();
    for (const row of leadRowsForDup) {
      const r = row as { id: string; email: string | null; phone_e164: string | null };
      const e = normEmail(r.email);
      if (e) emailBuckets.set(e, (emailBuckets.get(e) ?? 0) + 1);
      const p = normPhone(r.phone_e164);
      if (p) phoneBuckets.set(p, (phoneBuckets.get(p) ?? 0) + 1);
    }

    const providerEmailSet = new Set<string>();
    const providerPhoneSet = new Set<string>();
    if (emailBuckets.size || phoneBuckets.size) {
      const { data: providersForDup } = await supabase
        .from("providers")
        .select("email, billing_email, phone, billing_phone")
        .eq("tenant_id", tenantId);
      for (const raw of providersForDup ?? []) {
        const p = raw as {
          email: string | null;
          billing_email: string | null;
          phone: string | null;
          billing_phone: string | null;
        };
        for (const e of [normEmail(p.email), normEmail(p.billing_email)]) {
          if (e) providerEmailSet.add(e);
        }
        for (const ph of [normPhone(p.phone), normPhone(p.billing_phone)]) {
          if (ph) providerPhoneSet.add(ph);
        }
      }
    }

    let duplicateGroupCount = 0;
    let duplicateLeadCount = 0;
    for (const [k, n] of emailBuckets) {
      const matchesProvider = providerEmailSet.has(k);
      if (n >= 2 || matchesProvider) {
        duplicateGroupCount++;
        duplicateLeadCount += matchesProvider ? n : Math.max(0, n - 1);
      }
    }
    for (const [k, n] of phoneBuckets) {
      const matchesProvider = providerPhoneSet.has(k);
      if (n >= 2 || matchesProvider) {
        duplicateGroupCount++;
        duplicateLeadCount += matchesProvider ? n : Math.max(0, n - 1);
      }
    }

    return successResponse({
      urgent: {
        stalled_signups: stalledCount,
        dropped_off: droppedOffCount,
        pending_approval: pendingRes.count || 0,
        duplicate_groups: duplicateGroupCount,
        duplicate_leads: duplicateLeadCount,
      },
      kpis: {
        signups_today: signupsToday,
        signups_this_week: signupsThisWeek,
        leads_this_week: leadsWeekHead.count ?? 0,
        active_providers: activeRes.count || 0,
        total_leads: totalLeadsHead.count ?? 0,
        draft_providers: draftRes.count || 0,
      },
      pipeline: leadsByStage,
      recent_activities: recentActivities ?? [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch dashboard");
  }
}
