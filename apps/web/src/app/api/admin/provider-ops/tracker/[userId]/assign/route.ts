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
      .eq("tenant_id", tenantId)
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

    return successResponse({
      user_id: userId,
      assigned_to: assignedTo,
      assigned_by: user.id,
    });
  } catch (error) {
    return handleApiError(error, "Failed to assign tracker");
  }
}
