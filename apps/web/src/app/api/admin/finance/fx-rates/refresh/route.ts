import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { ingestFxReferenceRates } from "@/lib/fx/ingest-reference-rates";
import { bustFxRateMemo } from "@/lib/fx/get-fx-rate";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const reqMeta = extractRequestMeta(request);

    const summary = await ingestFxReferenceRates(supabase, { throwOnRequiredMissing: false });
    bustFxRateMemo();

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      module: "finance",
      action: "finance.fx.refresh",
      entity_type: "fx_reference_rates",
      entity_id: "ingest",
      risk_level: "medium",
      retention_tier: "financial",
      status: summary.requiredMissing.length > 0 ? "failed" : "succeeded",
      metadata: {
        required_missing: summary.requiredMissing,
        stale: summary.stale,
        warnings: summary.warnings,
        results_count: summary.results.length,
      },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse(summary);
  } catch (error) {
    return handleApiError(error, "Failed to refresh FX rates");
  }
}
