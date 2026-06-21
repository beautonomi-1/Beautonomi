import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { getMarketingBalance } from "@/lib/marketing/credits";

/**
 * GET /api/provider/marketing/credits
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await (await import("@/lib/supabase/server")).getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const balance = await getMarketingBalance(supabase, providerId);
    return successResponse(balance);
  } catch (error) {
    return handleApiError(error, "Failed to fetch marketing credits");
  }
}
