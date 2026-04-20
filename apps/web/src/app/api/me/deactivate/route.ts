import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { verifyCurrentPasswordForUser } from "@/lib/auth/verify-current-password";

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

    const { password, reason } = body;

    if (!password) {
      return NextResponse.json(
        { error: "Password is required to deactivate your account" },
        { status: 400 }
      );
    }

    const passwordOk = await verifyCurrentPasswordForUser(supabase, authUser, password);

    if (!passwordOk) {
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
