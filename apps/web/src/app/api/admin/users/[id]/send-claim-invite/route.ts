import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { sendShadowAccountClaimInvite } from "@/lib/auth/claim-shadow-account";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * POST /api/admin/users/[id]/send-claim-invite
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const { id } = await params;
    const supabaseAdmin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: userRow, error } = await supabaseAdmin
      .from("users")
      .select("id, email, is_shadow")
      .eq("id", id)
      .maybeSingle();

    if (error || !userRow) {
      return notFoundResponse("User not found");
    }

    const sent = await sendShadowAccountClaimInvite({
      supabaseAdmin,
      email: userRow.email as string,
      tenantId,
    });

    if (!sent) {
      return errorResponse(
        "User is not a guest/shadow account or invite could not be sent",
        "NOT_SHADOW",
        400,
      );
    }

    return successResponse({ message: "Claim invite sent." });
  } catch (error) {
    return handleApiError(error, "Failed to send claim invite");
  }
}
