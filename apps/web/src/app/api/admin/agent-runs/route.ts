import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("run_id");
    const supabase = getSupabaseAdmin();

    // Drill-down: steps for one run (tenant-scoped through the parent run).
    if (runId) {
      const { data: run } = await supabase
        .from("agent_runs")
        .select("id, tenant_id")
        .eq("id", runId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!run) return handleApiError(new Error("Not found"), "Run not found", "NOT_FOUND", 404);
      const { data: steps, error: stepsError } = await supabase
        .from("agent_steps")
        .select(
          "id, seq, kind, tool_name, tool_version, model_provider, model_id, tokens_in, tokens_out, cost_usd, latency_ms, schema_valid, policy_denied, error, created_at",
        )
        .eq("run_id", runId)
        .order("seq", { ascending: true });
      if (stepsError) throw stepsError;
      return successResponse({ runId, steps: steps ?? [] });
    }

    const { data, error } = await supabase
      .from("agent_runs")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return successResponse(data ?? []);
  } catch (error) {
    return handleApiError(error as Error, "Failed to list agent runs");
  }
}
