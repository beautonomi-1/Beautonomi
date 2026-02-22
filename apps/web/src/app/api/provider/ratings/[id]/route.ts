import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const updateRatingSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().optional(),
});

/**
 * PATCH /api/provider/ratings/[id]
 * 
 * Update a provider-to-client rating
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission('rate_clients', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider account required", 403);
    }

    const { id } = await params;
    const body = updateRatingSchema.parse(await request.json());

    // Verify rating exists and belongs to provider
    const { data: rating, error: ratingError } = await supabase
      .from("provider_client_ratings")
      .select("id, provider_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (ratingError || !rating) {
      return handleApiError(new Error("Rating not found"), "Rating not found or doesn't belong to your provider", 404);
    }

    // Update rating
    const updateData: any = {};
    if (body.rating !== undefined) updateData.rating = body.rating;
    if (body.comment !== undefined) updateData.comment = body.comment;

    const { data: updatedRating, error: updateError } = await supabase
      .from("provider_client_ratings")
      .update(updateData)
      .eq("id", id)
      .select("id, rating, comment, updated_at")
      .single();

    if (updateError) throw updateError;

    return successResponse(updatedRating);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        error,
        error.issues.map((e: any) => e.message).join(", "),
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to update rating");
  }
}

/**
 * DELETE /api/provider/ratings/[id]
 * 
 * Delete a provider-to-client rating
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission('rate_clients', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider account required", 403);
    }

    const { id } = await params;

    // Verify rating exists and belongs to provider
    const { data: rating, error: ratingError } = await supabase
      .from("provider_client_ratings")
      .select("id, provider_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (ratingError || !rating) {
      return handleApiError(new Error("Rating not found"), "Rating not found or doesn't belong to your provider", 404);
    }

    // Delete rating
    const { error: deleteError } = await supabase
      .from("provider_client_ratings")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    return successResponse({ id });
  } catch (error) {
    return handleApiError(error, "Failed to delete rating");
  }
}
