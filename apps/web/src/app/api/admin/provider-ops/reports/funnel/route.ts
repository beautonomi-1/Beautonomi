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

    const { count: totalSignups } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("role", "provider_owner");

    const { data: tenantUsers } = await supabase
      .from("users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("role", "provider_owner");
    const tenantUserIds = (tenantUsers || []).map((u: { id: string }) => u.id);

    const { count: startedWizard } = await supabase
      .from("provider_onboarding_drafts")
      .select("id", { count: "exact", head: true })
      .in("user_id", tenantUserIds.length > 0 ? tenantUserIds : ["__none__"]);

    // Completed wizard / submitted (has provider record)
    const { count: submitted } = await supabase
      .from("providers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    // Approved / active
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

    // Lead funnel
    const { data: leads } = await supabase
      .from("provider_leads")
      .select("commercial_stage, source")
      .eq("tenant_id", tenantId);

    const leadsByStage: Record<string, number> = {};
    const leadsBySource: Record<string, number> = {};
    for (const lead of leads || []) {
      const stage = (lead as { commercial_stage: string }).commercial_stage;
      const source = (lead as { source: string }).source;
      leadsByStage[stage] = (leadsByStage[stage] || 0) + 1;
      leadsBySource[source] = (leadsBySource[source] || 0) + 1;
    }

    const signupCount = totalSignups || 0;
    const wizardCount = startedWizard || 0;
    const submittedCount = submitted || 0;
    const activeCount = active || 0;

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
        total_leads: leads?.length || 0,
        by_stage: leadsByStage,
        by_source: leadsBySource,
        matched: leadsByStage.matched || 0,
        conversion_rate:
          (leads?.length || 0) > 0
            ? Math.round(
                ((leadsByStage.matched || 0) / (leads?.length || 1)) * 100
              )
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
