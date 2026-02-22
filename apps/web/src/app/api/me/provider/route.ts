import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireAuthInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/provider
 * Get current user's provider information
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer();
    const providerId = await getProviderIdForUser(user.id);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider account not found",
        404
      );
    }

    const { data: provider, error } = await supabase
      .from("providers")
      .select("id, business_name, business_type, description, gallery, thumbnail_url, capabilities, status")
      .eq("id", providerId)
      .single();

    if (error) {
      throw error;
    }

    return successResponse(provider);
  } catch (error) {
    return handleApiError(error, "Failed to load provider information");
  }
}
