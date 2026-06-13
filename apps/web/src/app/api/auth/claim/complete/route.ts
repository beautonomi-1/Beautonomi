import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { completeShadowAccountClaim } from "@/lib/auth/claim-shadow-account";

/**
 * POST /api/auth/claim/complete
 *
 * Marks shadow account as claimed after password set / profile completion.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabaseAdmin = getSupabaseAdmin();

    await completeShadowAccountClaim(supabaseAdmin, user.id);

    const supabase = await getSupabaseServer(request);
    const { data: profile } = await supabase
      .from("users")
      .select("id, email, full_name, is_shadow, claimed_at")
      .eq("id", user.id)
      .maybeSingle();

    return successResponse({
      user: profile,
      message: "Account claimed successfully.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to complete account claim");
  }
}
