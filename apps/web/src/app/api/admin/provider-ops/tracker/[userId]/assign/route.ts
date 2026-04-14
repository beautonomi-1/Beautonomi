import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { insertNotification } from "@/lib/notifications/insert-notification";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { user } = await requireAdminSection(
      ADMIN_SECTION_PROVIDER_OPS,
      request
    );
    const { userId } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const assignedTo = body.assigned_to || null;

    const { data: targetUser } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .eq("preferred_home_tenant_id", tenantId)
      .maybeSingle();
    if (!targetUser) {
      const { notFoundResponse } = await import("@/lib/supabase/api-helpers");
      return notFoundResponse("User not found in this tenant");
    }

    const { error: upsertErr } = await supabase
      .from("provider_onboarding_tracking")
      .upsert(
        {
          user_id: userId,
          tenant_id: tenantId,
          assigned_to: assignedTo,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    if (upsertErr) throw upsertErr;

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.tracker.assign",
      entity_type: "provider_onboarding_tracking",
      entity_id: userId,
      module: "provider_ops",
      risk_level: "low",
      retention_tier: "routine",
      metadata: { assigned_to: assignedTo },
      ...extractRequestMeta(request),
    });

    if (assignedTo) {
      void insertNotification({
        user_id: assignedTo,
        type: "staff_assignment",
        title: "Onboarding assignment",
        message: `You have been assigned to assist a provider through onboarding.`,
        action_url: `/admin/provider-ops/tracker/${userId}`,
        data: { provider_user_id: userId, assigned_by: user.id },
      });
    }

    return successResponse({
      user_id: userId,
      assigned_to: assignedTo,
      assigned_by: user.id,
    });
  } catch (error) {
    return handleApiError(error, "Failed to assign tracker");
  }
}
