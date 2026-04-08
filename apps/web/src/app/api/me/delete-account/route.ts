import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { purgeUserMessageAttachmentFiles } from "@/lib/account/purge-user-message-files";

/**
 * POST /api/me/delete-account
 *
 * Permanently deletes the current user from Supabase Auth. `public.users` and most related rows
 * cascade from `auth.users`; chat files in Storage are removed explicitly so they are not left orphaned.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const { password, reason } = body;

    if (!password) {
      return NextResponse.json({ error: "Password is required to delete your account" }, { status: 400 });
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: password,
    });

    if (signInError) {
      return NextResponse.json({ error: "Password is incorrect" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();

    const { error: updateError } = await admin
      .from("users")
      .update({
        account_deletion_requested_at: new Date().toISOString(),
        is_active: false,
        deactivation_reason: reason || "Account deletion requested",
      })
      .eq("id", user.id);

    if (updateError) {
      throw updateError;
    }

    await purgeUserMessageAttachmentFiles(admin, user.id);

    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(user.id);

    if (deleteAuthError) {
      console.error("Failed to delete user from auth:", deleteAuthError);
      return NextResponse.json(
        { error: "Could not complete account deletion. Please contact support." },
        { status: 500 }
      );
    }

    try {
      await supabase.auth.signOut();
    } catch {
      /* session may already be invalid */
    }

    return successResponse({
      message:
        "Your account has been deleted and you have been signed out. Thank you for using Beautonomi.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to delete account");
  }
}
