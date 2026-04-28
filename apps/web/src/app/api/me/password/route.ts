import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { verifyCurrentPasswordForUser } from "@/lib/auth/verify-current-password";
import { resolvePublicAuthPolicyForTenant } from "@/lib/config/resolve-public-auth-policy";
import { passwordMeetsPolicyRequirements } from "@/lib/config/auth-policy-public";

export async function PUT(request: NextRequest) {
  try {
    await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json() as { currentPassword?: string; newPassword?: string };
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (!newPassword) {
      return NextResponse.json({ error: "New password is required" }, { status: 400 });
    }

    const { data: userRow } = await supabase
      .from("users")
      .select("preferred_home_tenant_id")
      .eq("id", authUser.id)
      .maybeSingle();
    const policy = await resolvePublicAuthPolicyForTenant(
      (userRow as { preferred_home_tenant_id?: string | null } | null)?.preferred_home_tenant_id ?? null
    );

    if (newPassword.length < policy.minimum_password_length) {
      return NextResponse.json(
        { error: `New password must be at least ${policy.minimum_password_length} characters long` },
        { status: 400 }
      );
    }

    if (!passwordMeetsPolicyRequirements(newPassword, policy.password_requirements)) {
      return NextResponse.json(
        { error: "New password does not meet the required character mix for this platform" },
        { status: 400 }
      );
    }

    if (policy.require_current_password) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password is required" },
          { status: 400 }
        );
      }
      const passwordOk = await verifyCurrentPasswordForUser(supabase, authUser, currentPassword);
      if (!passwordOk) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 401 }
        );
      }
    } else if (currentPassword) {
      const passwordOk = await verifyCurrentPasswordForUser(supabase, authUser, currentPassword);
      if (!passwordOk) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 401 }
        );
      }
    }

    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      throw updateError;
    }

    // Update password_changed_at in users table
    const { error: dbError } = await supabase
      .from('users')
      .update({ password_changed_at: new Date().toISOString() })
      .eq('id', authUser.id);

    if (dbError) {
      console.error("Failed to update password_changed_at:", dbError);
      // Don't fail the request if this update fails
    }

    return successResponse({ message: "Password updated successfully" });
  } catch (error) {
    return handleApiError(error, "Failed to update password");
  }
}
