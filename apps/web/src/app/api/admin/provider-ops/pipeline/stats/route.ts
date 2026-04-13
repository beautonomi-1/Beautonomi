import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { PROVIDER_LEAD_PIPELINE_STAGES } from "@/lib/provider-ops/lead-pipeline-stages";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    // Head-only count queries — avoids PostgREST default row cap on large tenants
    const countResults = await Promise.all(
      PROVIDER_LEAD_PIPELINE_STAGES.map(async (stage) => {
        const { count, error } = await supabase
          .from("provider_leads")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("commercial_stage", stage);
        if (error) throw error;
        return [stage, count ?? 0] as const;
      })
    );

    const counts: Record<string, number> = {};
    let total = 0;
    for (const [stage, c] of countResults) {
      counts[stage] = c;
      total += c;
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
