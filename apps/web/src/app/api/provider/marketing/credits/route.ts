import { NextRequest } from "next/server";
import {
  getProviderIdForUser,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getMarketingBalance } from "@/lib/marketing/credits";

/**
 * GET /api/provider/marketing/credits
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("manage_marketing", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const supabase = await (await import("@/lib/supabase/server")).getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const balance = await getMarketingBalance(supabase, providerId);
    return successResponse(balance);
  } catch (error) {
    return handleApiError(error, "Failed to fetch marketing credits");
  }
}
