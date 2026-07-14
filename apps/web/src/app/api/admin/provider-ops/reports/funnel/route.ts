import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { chunkIds, fetchAllPaged } from "@/lib/provider-ops/postgrest-unbounded";
import { loadTenantScopedUserIds } from "@/lib/provider-ops/scoped-onboarding-drafts";
import { PROVIDER_LEAD_PIPELINE_STAGES } from "@/lib/provider-ops/lead-pipeline-stages";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: signupRpc, error: signupRpcErr } = await supabase.rpc(
      "admin_count_users_in_tenant_scope",
      {
        p_tenant_id: tenantId,
        p_role: "provider_owner",
      }
    );
    if (signupRpcErr) {
      console.warn("admin_count_users_in_tenant_scope (funnel):", signupRpcErr.message);
    }
    const parsedSignup =
      signupRpcErr || signupRpc == null
        ? 0
        : typeof signupRpc === "number"
          ? signupRpc
          : Number(signupRpc);
    const totalSignups = Number.isFinite(parsedSignup) ? parsedSignup : 0;

    const scopedIds = await loadTenantScopedUserIds(tenantId);
    let startedWizard = 0;
    for (const chunk of chunkIds(scopedIds, 400)) {
      const { count, error: wizErr } = await supabase
        .from("provider_onboarding_drafts")
        .select("id", { count: "exact", head: true })
        .in("user_id", chunk);
      if (wizErr) throw wizErr;
      startedWizard += count ?? 0;
    }

    const { count: submitted } = await supabase
      .from("providers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    const { count: active } = await supabase
      .from("providers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "active");

    const { count: adminAssisted } = await supabase
      .from("provider_onboarding_tracking")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("admin_assisted", true);

    // Lead funnel - use exact counts instead of fetching all rows
    const { count: totalLeads } = await supabase
      .from("provider_leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);

    const leadsByStage: Record<string, number> = {};
    for (const stage of PROVIDER_LEAD_PIPELINE_STAGES) {
      const { count } = await supabase
        .from("provider_leads")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .eq("commercial_stage", stage);
      leadsByStage[stage] = count ?? 0;
    }

    // Source breakdown - fetch all with pagination to avoid 1000-row cap
    const allLeads = await fetchAllPaged<{ source: string }>(async (from, to) => {
      const r = await supabase
        .from("provider_leads")
        .select("source")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .range(from, to);
      return { data: r.data as { source: string }[] | null, error: r.error };
    });
    const leadsBySource: Record<string, number> = {};
    for (const lead of allLeads) {
      leadsBySource[lead.source] = (leadsBySource[lead.source] || 0) + 1;
    }

    const signupCount = totalSignups || 0;
    const wizardCount = startedWizard || 0;
    const submittedCount = submitted || 0;
    const activeCount = active || 0;
    const leadsTotal = totalLeads || 0;

    return successResponse({
      onboarding_funnel: {
        total_signups: signupCount,
        started_wizard: wizardCount,
        submitted: submittedCount,
        active: activeCount,
        signup_to_wizard_rate: signupCount > 0 ? Math.round((wizardCount / signupCount) * 100) : 0,
        wizard_to_submit_rate: wizardCount > 0 ? Math.round((submittedCount / wizardCount) * 100) : 0,
        submit_to_active_rate: submittedCount > 0 ? Math.round((activeCount / submittedCount) * 100) : 0,
        overall_conversion_rate: signupCount > 0 ? Math.round((activeCount / signupCount) * 100) : 0,
      },
      lead_funnel: {
        total_leads: leadsTotal,
        by_stage: leadsByStage,
        by_source: leadsBySource,
        matched: leadsByStage.matched || 0,
        conversion_rate:
          leadsTotal > 0
            ? Math.round(((leadsByStage.matched || 0) / leadsTotal) * 100)
            : 0,
      },
      admin_productivity: {
        admin_assisted_onboardings: adminAssisted || 0,
        self_serve_rate:
          submittedCount > 0
            ? Math.round(
                ((submittedCount - (adminAssisted || 0)) / submittedCount) * 100
              )
            : 0,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch funnel report");
  }
}
