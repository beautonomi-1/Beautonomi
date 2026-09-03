import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { revokeStaffInvitations } from "@/lib/provider/staff-invitations";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * POST /api/provider/staff/[id]/invite/revoke
 * Revoke every pending invite for a staff member (manage_team). The join link
 * stops validating immediately; the staff row itself is left untouched so the
 * owner can resend later.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("manage_team", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: staff, error: staffError } = await supabase
      .from("provider_staff")
      .select("id, invite_accepted_at")
      .eq("id", id)
      .eq("provider_id", providerId)
      .is("deleted_at", null)
      .maybeSingle();

    if (staffError || !staff) {
      return notFoundResponse("Staff member not found");
    }

    if ((staff as { invite_accepted_at?: string | null }).invite_accepted_at) {
      return errorResponse(
        "This team member already accepted their invite. Deactivate them instead.",
        "INVITE_ALREADY_ACCEPTED",
        409,
      );
    }

    const admin = getSupabaseAdmin();
    const { revoked } = await revokeStaffInvitations(admin, {
      providerId,
      staffId: id,
      revokedBy: user.id,
    });

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? null,
      action: "staff.invite_revoked",
      entity_type: "provider_staff",
      entity_id: id,
      module: "staff",
      risk_level: "low",
      metadata: { provider_id: providerId, invitations_revoked: revoked },
      retention_tier: "access",
      ...extractRequestMeta(request),
    });

    return successResponse({ success: true, revoked, staff_id: id });
  } catch (error) {
    return handleApiError(error, "Failed to revoke invitation");
  }
}
