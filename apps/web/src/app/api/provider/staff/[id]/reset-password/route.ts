import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * POST /api/provider/staff/[id]/reset-password
 * 
 * Send password reset email to staff member
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get staff member
    const { data: staff, error: staffError } = await supabase
      .from("provider_staff")
      .select("id, user_id, email")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (staffError || !staff) {
      return notFoundResponse("Staff member not found");
    }

    const email = staff.email?.trim();
    if (!email) {
      return handleApiError(
        new Error("Staff member has no email address set. Add an email in the staff profile first."),
        "Staff member has no email set",
        "VALIDATION_ERROR",
        400
      );
    }

    // Trigger Supabase Auth to send the built-in password reset email via the recover endpoint
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      throw new Error("Supabase URL or anon key not configured");
    }

    const recoverRes = await fetch(`${supabaseUrl}/auth/v1/recover`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": anonKey,
      },
      body: JSON.stringify({
        email,
        redirect_to: `${process.env.NEXT_PUBLIC_APP_URL || ""}/auth/callback?next=/provider`,
      }),
    });

    if (!recoverRes.ok) {
      const errBody = await recoverRes.json().catch(() => ({}));
      const msg = errBody?.msg ?? errBody?.message ?? "Failed to send reset email";
      return handleApiError(new Error(msg), msg, "RESET_FAILED", recoverRes.status);
    }

    return successResponse({
      success: true,
      message: "Password reset email sent successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to send password reset email");
  }
}
