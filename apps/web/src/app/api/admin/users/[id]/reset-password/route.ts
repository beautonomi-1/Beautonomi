import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";
import { writeAuditLog } from "@/lib/audit/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const { id } = await params;
    const tenantId = await resolveAdminApiTenantId(request);

    const admin = getSupabaseAdmin();

    const accessible = await getUserRowIfAccessibleToAdminTenant(admin, tenantId, id);
    const targetUser = accessible as { id?: string; email?: string | null; full_name?: string | null; role?: string } | null;

    if (!targetUser?.email) {
      return NextResponse.json(
        { data: null, error: { message: "User not found or has no email", code: "NOT_FOUND" } },
        { status: 404 },
      );
    }

    if (targetUser.role === "superadmin" && id !== user.id) {
      return NextResponse.json(
        { data: null, error: { message: "Cannot reset another superadmin's password", code: "FORBIDDEN" } },
        { status: 403 },
      );
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: targetUser.email,
    });

    if (linkError) {
      console.error("Failed to generate recovery link:", linkError);
      return NextResponse.json(
        { data: null, error: { message: "Failed to generate password reset link", code: "LINK_ERROR" } },
        { status: 500 },
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.user.password_reset",
      entity_type: "user",
      entity_id: id,
      metadata: { target_email: targetUser.email },
    }).catch(() => {});

    return successResponse({
      message: "Password reset link generated",
      recovery_link: linkData?.properties?.action_link ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to generate password reset");
  }
}
