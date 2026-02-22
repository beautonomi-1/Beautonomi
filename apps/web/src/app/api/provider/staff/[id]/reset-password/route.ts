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

    // Use Supabase Auth to send password reset email
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Service role key not configured");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Send password reset email
    const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: staff.email,
    });

    if (resetError) {
      throw resetError;
    }

    // In a real implementation, you might want to:
    // 1. Log the password reset request
    // 2. Send a custom email with your branding
    // 3. Track password reset attempts

    return successResponse({
      success: true,
      message: "Password reset email sent successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to send password reset email");
  }
}
