import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin } = await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const adminClient = getSupabaseAdmin();

    const { id } = await params;

    const accessible = await getUserRowIfAccessibleToAdminTenant(adminClient, tenantId, id);
    if (!accessible) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "User not found",
            code: "USER_NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { new_password } = body;

    if (!new_password || new_password.length < 8) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Password must be at least 8 characters",
            code: "VALIDATION_ERROR",
          },
        },
        { status: 400 }
      );
    }

    const { error } = await adminClient.auth.admin.updateUserById(id, {
      password: new_password,
    });

    if (error) {
      console.error("Error updating password:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: error.message || "Failed to update password",
            code: "PASSWORD_UPDATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: admin.id,
      actor_role: admin.role,
      action: "admin.user.password_change",
      entity_type: "user",
      entity_id: id,
      module: "users_trust",
      risk_level: "high",
      retention_tier: "access",
      status: "succeeded",
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
      superadmin_bypass_used: admin.role === "superadmin",
    });

    return NextResponse.json({
      data: { success: true },
      error: null,
    });
  } catch (error: unknown) {
    console.error("Error in password reset:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Failed to reset password",
          code: "SERVER_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
