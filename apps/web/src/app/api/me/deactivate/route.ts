import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { verifySensitiveActionForUser } from "@/lib/auth/verify-sensitive-action";
import {
  parseSensitiveActionCredentials,
  resolveAuthSecurityForUser,
  validateSensitiveActionCredentials,
} from "@/lib/auth/validate-sensitive-action-input";

export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { password, verificationNonce } = parseSensitiveActionCredentials(body);
    const reason = typeof body?.reason === "string" ? body.reason : null;

    const authSecurity = await resolveAuthSecurityForUser(supabase, authUser);
    const validation = validateSensitiveActionCredentials(authSecurity, { password, verificationNonce }, "deactivate your account");
    if (validation.ok === false) {
      return NextResponse.json({ error: validation.message }, { status: validation.status });
    }

    const verified = await verifySensitiveActionForUser(supabase, authUser, {
      password: password || null,
      nonce: verificationNonce || null,
    });

    if (!verified) {
      return NextResponse.json(
        {
          error: password
            ? "Password is incorrect"
            : "Verification code is invalid or expired",
        },
        { status: 401 }
      );
    }

    // Deactivate account (self-service: deactivated_by = 'user' so they can reactivate by logging in)
    const { error: updateError } = await supabase
      .from('users')
      .update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivation_reason: reason || null,
        deactivated_by: 'user',
      })
      .eq('id', authUser.id);

    if (updateError) {
      throw updateError;
    }

    // Sign out the user after deactivation
    await supabase.auth.signOut();

    return successResponse({ message: "Account deactivated successfully" });
  } catch (error) {
    return handleApiError(error, "Failed to deactivate account");
  }
}
