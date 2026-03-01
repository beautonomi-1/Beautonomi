import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const { password, reason } = body;

    if (!password) {
      return NextResponse.json(
        { error: "Password is required to deactivate your account" },
        { status: 400 }
      );
    }

    // Verify password by attempting to sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: password,
    });

    if (signInError) {
      return NextResponse.json(
        { error: "Password is incorrect" },
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
      .eq('id', user.id);

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
