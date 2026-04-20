import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { verifyCurrentPasswordForUser } from "@/lib/auth/verify-current-password";

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

    const body = await request.json();

    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current password and new password are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters long" },
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
