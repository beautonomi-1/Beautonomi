import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { resolvePublicAuthPolicyForTenant } from "@/lib/config/resolve-public-auth-policy";
import { passwordMeetsPolicyRequirements } from "@/lib/config/auth-policy-public";
import { getUserAuthSecurityState } from "@/lib/auth/user-auth-security-state";

type PasswordRequestBody = {
  mode?: "change" | "set";
  currentPassword?: string;
  newPassword?: string;
  nonce?: string;
};

function passwordUpdateErrorResponse(message: string) {
  const lower = message.toLowerCase();
  const isCurrentPasswordError =
    lower.includes("current") ||
    lower.includes("invalid login") ||
    lower.includes("invalid credentials");
  const isNonceError =
    lower.includes("nonce") ||
    lower.includes("otp") ||
    lower.includes("token") ||
    lower.includes("expired");

  return NextResponse.json(
    { error: isNonceError ? "Verification code is invalid or expired" : isCurrentPasswordError ? "Current password is incorrect" : message },
    { status: isCurrentPasswordError || isNonceError ? 401 : 400 },
  );
}

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

    const body = await request.json() as PasswordRequestBody;
    const mode = body.mode === "set" ? "set" : "change";
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const nonce = typeof body.nonce === "string" ? body.nonce.trim() : "";

    if (!newPassword) {
      return NextResponse.json({ error: "New password is required" }, { status: 400 });
    }

    const { data: userRow } = await supabase
      .from("users")
      .select("preferred_home_tenant_id, password_changed_at")
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

    const authSecurity = await getUserAuthSecurityState(supabase, authUser, {
      preferred_home_tenant_id: (userRow as { preferred_home_tenant_id?: string | null } | null)?.preferred_home_tenant_id ?? null,
      password_changed_at: (userRow as { password_changed_at?: string | null } | null)?.password_changed_at ?? null,
    });

    if (mode === "set") {
      if (authSecurity.has_password) {
        return NextResponse.json(
          { error: "Password is already set. Use change password instead." },
          { status: 409 },
        );
      }
      if (!nonce) {
        return NextResponse.json(
          { error: "Verification code is required to set a password" },
          { status: 400 },
        );
      }
    } else if (policy.require_current_password) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password is required" },
          { status: 400 }
        );
      }
    }

    const updateAttributes =
      mode === "set"
        ? ({ password: newPassword, nonce } as { password: string; nonce: string })
        : currentPassword
          ? ({ password: newPassword, current_password: currentPassword } as {
              password: string;
              current_password: string;
            })
          : ({ password: newPassword } as { password: string });

    const { error: updateError } = await supabase.auth.updateUser({
      ...updateAttributes,
    } as Parameters<typeof supabase.auth.updateUser>[0]);

    if (updateError) {
      return passwordUpdateErrorResponse(updateError.message);
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
