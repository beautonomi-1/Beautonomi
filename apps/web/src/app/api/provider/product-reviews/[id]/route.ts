import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const responseSchema = z.object({
  provider_response: z.string().min(1).max(1000),
});

/**
 * PATCH /api/provider/product-reviews/[id]
 * Provider responds to a product review
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const body = await request.json();
    const parsed = responseSchema.parse(body);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    // Verify the review belongs to a product owned by this provider
    const { data: review, error: fetchErr } = await (supabase.from("product_reviews") as any)
      .select("id, product:products!inner(provider_id)")
      .eq("id", id)
      .single();

    if (fetchErr || !review || review.product?.provider_id !== providerId) {
      return notFoundResponse("Review not found");
    }

    const { data: updated, error } = await (supabase.from("product_reviews") as any)
      .update({
        provider_response: parsed.provider_response,
        provider_response_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return successResponse({ review: updated });
  } catch (err) {
    return handleApiError(err, "Failed to respond to review");
  }
}
