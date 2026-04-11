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

    const { data: leads, error } = await supabase
      .from("provider_leads")
      .select("id, commercial_stage")
      .eq("tenant_id", tenantId);
    if (error) throw error;

    const stages = [
      "new",
      "contacted",
      "qualified",
      "proposal_sent",
      "negotiating",
      "won",
      "lost",
      "nurture",
      "matched",
    ];

    const counts: Record<string, number> = {};
    for (const s of stages) counts[s] = 0;
    let total = 0;

    for (const lead of leads || []) {
      const stage = lead.commercial_stage as string;
      counts[stage] = (counts[stage] || 0) + 1;
      total++;
    }

    return successResponse({
      total,
      by_stage: counts,
      active_pipeline: total - (counts.lost || 0) - (counts.matched || 0),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch pipeline stats");
  }
}
