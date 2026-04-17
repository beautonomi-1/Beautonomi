import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin } = await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const supabase = await getSupabaseServer(request);

    if (!supabase) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Supabase client not available",
            code: "SERVER_ERROR",
          },
        },
        { status: 500 }
      );
    }

    const { id } = await params;
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

    // Use Supabase Admin API to update password
    // Note: This requires service role key or admin API access
    const { error } = await supabase.auth.admin.updateUserById(id, {
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
