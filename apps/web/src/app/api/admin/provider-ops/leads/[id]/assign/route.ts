import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(
      ADMIN_SECTION_PROVIDER_OPS,
      request
    );
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const body = await request.json();
    const tenantId = await resolveAdminApiTenantId(request);

    const assignedTo = body.assigned_to || null;

    const { error } = await supabase
      .from("provider_leads")
      .update({ assigned_to: assignedTo })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) throw error;

    const { error: actErr } = await supabase.from("provider_lead_activities").insert({
      lead_id: id,
      activity_type: "assignment_changed",
      description: assignedTo
        ? `Assigned to ${body.assigned_to_name || assignedTo}`
        : "Unassigned",
      metadata: { assigned_to: assignedTo },
      performed_by: user.id,
    });
    if (actErr) throw actErr;

    return successResponse({ id, assigned_to: assignedTo });
  } catch (error) {
    return handleApiError(error, "Failed to assign lead");
  }
}
