import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * POST /api/admin/staff/[id]/reset-password
 * Send password reset email to staff member (superadmin only).
 * Uses staff email or linked user's email.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const { id } = await params;

    const { data: staff, error: staffError } = await supabase
      .from("provider_staff")
      .select("id, user_id, email")
      .eq("id", id)
      .single();

    if (staffError || !staff) {
      return notFoundResponse("Staff member not found");
    }

    let email: string | null = (staff as any).email?.trim() || null;
    if (!email && (staff as any).user_id) {
      const { data: user } = await supabase
        .from("users")
        .select("email")
        .eq("id", (staff as any).user_id)
        .single();
      email = (user as any)?.email?.trim() || null;
    }

    if (!email) {
      return handleApiError(
        new Error("Staff member has no email. Add an email in the staff profile first."),
        "Staff member has no email set",
        "VALIDATION_ERROR",
        400
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      throw new Error("Supabase URL or anon key not configured");
    }

    const recoverRes = await fetch(`${supabaseUrl}/auth/v1/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": anonKey },
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
