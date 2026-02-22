import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireAuthInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/onboarding/draft
 * Get saved onboarding draft for current user
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer(request);

    const { data: draft, error } = await supabase
      .from("provider_onboarding_drafts")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found, which is fine
      throw error;
    }

    return successResponse(draft || null);
  } catch (error) {
    return handleApiError(error, "Failed to load draft");
  }
}

/**
 * POST /api/provider/onboarding/draft
 * Save onboarding draft
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const { draft_data, current_step } = body;

    if (!draft_data) {
      return handleApiError(
        new Error("draft_data is required"),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }

    // Upsert draft
    const { data: draft, error } = await supabase
      .from("provider_onboarding_drafts")
      .upsert(
        {
          user_id: user.id,
          draft_data: draft_data,
          current_step: current_step || 1,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id",
        }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(draft);
  } catch (error) {
    return handleApiError(error, "Failed to save draft");
  }
}

/**
 * DELETE /api/provider/onboarding/draft
 * Delete saved draft (after successful onboarding)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer(request);

    const { error } = await supabase
      .from("provider_onboarding_drafts")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }

    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete draft");
  }
}
