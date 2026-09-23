import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { requireOpsDesk } from "@/lib/provider-ops/ops-desk-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    await requireOpsDesk(["retention"], request);
    const { id: caseId, taskId } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();
    const body = (await request.json()) as { completed?: boolean };

    const { data: caseRow } = await supabase
      .from("provider_ops_cases")
      .select("provider_id")
      .eq("id", caseId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!caseRow) return notFoundResponse("Case not found");

    const { data: task } = await supabase
      .from("provider_lead_tasks")
      .select("id")
      .eq("id", taskId)
      .eq("tenant_id", tenantId)
      .eq("provider_id", caseRow.provider_id)
      .maybeSingle();
    if (!task) return notFoundResponse("Task not found");

    if (body.completed) {
      await supabase
        .from("provider_lead_tasks")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", taskId);
    }

    return successResponse({ ok: true });
  } catch (error) {
    return handleApiError(error, "Failed to update task");
  }
}
