import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { requireOpsDesk } from "@/lib/provider-ops/ops-desk-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireOpsDesk(["retention"], request);
    const { id: caseId } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();
    const body = (await request.json()) as {
      title?: string;
      due_at?: string;
      description?: string;
    };

    if (!body.title?.trim()) {
      return errorResponse("Title is required", "VALIDATION_ERROR", 400);
    }

    const { data: caseRow } = await supabase
      .from("provider_ops_cases")
      .select("id, provider_id, retention_owner_id")
      .eq("id", caseId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!caseRow) return notFoundResponse("Case not found");

    const { data: task, error } = await supabase
      .from("provider_lead_tasks")
      .insert({
        tenant_id: tenantId,
        provider_id: caseRow.provider_id,
        lead_id: null,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        due_at: body.due_at || null,
        assigned_to: caseRow.retention_owner_id ?? user.id,
        created_by: user.id,
        task_type: "follow_up",
      })
      .select("id")
      .single();
    if (error) throw error;

    return successResponse({ id: task.id });
  } catch (error) {
    return handleApiError(error, "Failed to create task");
  }
}
