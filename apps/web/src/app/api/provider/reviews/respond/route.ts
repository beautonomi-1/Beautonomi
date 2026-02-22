import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser } from "@/lib/supabase/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    const body = await request.json();
    const { review_id, response } = body;

    if (!review_id || !response) {
      return handleApiError(new Error("review_id and response are required"), "VALIDATION_ERROR", 400);
    }

    const { data: review, error: fetchError } = await supabase
      .from("reviews")
      .select("id, provider_id")
      .eq("id", review_id)
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !review) {
      return handleApiError(new Error("Review not found"), "NOT_FOUND", 404);
    }

    const { error: updateError } = await supabase
      .from("reviews")
      .update({
        provider_response: response,
        responded_at: new Date().toISOString(),
      })
      .eq("id", review_id);

    if (updateError) throw updateError;

    return successResponse({ success: true });
  } catch (error) {
    console.error("Error responding to review:", error);
    return handleApiError(error, "Failed to respond to review");
  }
}
