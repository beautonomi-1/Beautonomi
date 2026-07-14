import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { PROVIDER_LEAD_PIPELINE_STAGES } from "@/lib/provider-ops/lead-pipeline-stages";
import { chunkIds, fetchAllPaged } from "@/lib/provider-ops/postgrest-unbounded";

type StageKey = (typeof PROVIDER_LEAD_PIPELINE_STAGES)[number];

function emptyStageCounts(): Record<StageKey, number> {
  const o = {} as Record<StageKey, number>;
  for (const s of PROVIDER_LEAD_PIPELINE_STAGES) o[s] = 0;
  return o;
}

function labelForUser(row: { full_name?: string | null; email?: string | null }): string {
  const n = typeof row.full_name === "string" ? row.full_name.trim() : "";
  const e = typeof row.email === "string" ? row.email.trim() : "";
  return n || e || "—";
}

/**
 * Per-assignee lead pipeline counts + activity volume by admin user for this tenant's leads.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    type LeadRow = {
      id: string;
      assigned_to: string | null;
      commercial_stage: string;
    };

    const leadRows = await fetchAllPaged<LeadRow>(async (from, to) => {
      const r = await supabase
        .from("provider_leads")
        .select("id, assigned_to, commercial_stage")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .range(from, to);
      return { data: r.data as LeadRow[] | null, error: r.error };
    });

    const leadIds = leadRows.map((r) => r.id);

    type OwnerAgg = {
      by_stage: Record<StageKey, number>;
      total: number;
      matched: number;
    };

    const byOwner = new Map<string | null, OwnerAgg>();

    function bucket(ownerId: string | null): OwnerAgg {
      const k = ownerId;
      let b = byOwner.get(k);
      if (!b) {
        b = { by_stage: emptyStageCounts(), total: 0, matched: 0 };
        byOwner.set(k, b);
      }
      return b;
    }

    for (const row of leadRows) {
      const ownerId = typeof row.assigned_to === "string" ? row.assigned_to : null;
      const b = bucket(ownerId);
      b.total += 1;
      const st = row.commercial_stage as StageKey;
      if (PROVIDER_LEAD_PIPELINE_STAGES.includes(st)) {
        b.by_stage[st] += 1;
        if (st === "matched") b.matched += 1;
      }
    }

    const activityByPerformer = new Map<string | null, Map<string, number>>();
    function bumpActivity(uid: string | null, activityType: string) {
      let inner = activityByPerformer.get(uid);
      if (!inner) {
        inner = new Map();
        activityByPerformer.set(uid, inner);
      }
      inner.set(activityType, (inner.get(activityType) ?? 0) + 1);
    }

    if (leadIds.length > 0) {
      for (const chunk of chunkIds(leadIds, 400)) {
        type ActRow = { performed_by: string | null; activity_type: string };
        const actRows = await fetchAllPaged<ActRow>(async (from, to) => {
          const r = await supabase
            .from("provider_lead_activities")
            .select("performed_by, activity_type")
            .in("lead_id", chunk)
            .range(from, to);
          return { data: r.data as ActRow[] | null, error: r.error };
        });
        for (const a of actRows) {
          bumpActivity(typeof a.performed_by === "string" ? a.performed_by : null, a.activity_type || "unknown");
        }
      }
    }

    const userIds = new Set<string>();
    for (const id of byOwner.keys()) {
      if (id) userIds.add(id);
    }
    for (const id of activityByPerformer.keys()) {
      if (id) userIds.add(id);
    }

    const userMeta = new Map<string, { full_name: string | null; email: string | null }>();
    if (userIds.size > 0) {
      const { data: users, error: uErr } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", [...userIds]);
      if (uErr) throw uErr;
      for (const u of users ?? []) {
        userMeta.set(u.id as string, {
          full_name: typeof u.full_name === "string" ? u.full_name : null,
          email: typeof u.email === "string" ? u.email : null,
        });
      }
    }

    const leads_by_owner = [...byOwner.entries()]
      .map(([user_id, agg]) => {
        const meta = user_id ? userMeta.get(user_id) : null;
        return {
          user_id,
          full_name: meta?.full_name ?? null,
          email: meta?.email ?? null,
          label:
            user_id == null
              ? "Unassigned"
              : labelForUser({ full_name: meta?.full_name, email: meta?.email }),
          by_stage: agg.by_stage,
          total_leads: agg.total,
          matched_leads: agg.matched,
        };
      })
      .sort((a, b) => b.total_leads - a.total_leads || String(a.label).localeCompare(String(b.label)));

    const activity_by_user = [...activityByPerformer.entries()]
      .map(([user_id, typeMap]) => {
        const meta = user_id ? userMeta.get(user_id) : null;
        const by_type: Record<string, number> = {};
        let total = 0;
        for (const [t, c] of typeMap) {
          by_type[t] = c;
          total += c;
        }
        return {
          user_id,
          full_name: meta?.full_name ?? null,
          email: meta?.email ?? null,
          label:
            user_id == null
              ? "System / unknown user"
              : labelForUser({ full_name: meta?.full_name, email: meta?.email }),
          total_activities: total,
          by_type,
        };
      })
      .sort((a, b) => b.total_activities - a.total_activities);

    return successResponse({
      generated_at: new Date().toISOString(),
      leads_by_owner,
      activity_by_user,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load lead assignee report");
  }
}
