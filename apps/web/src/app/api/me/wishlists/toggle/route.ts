import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const toggleSchema = z.object({
  wishlist_id: z.string().uuid().optional(),
  item_type: z.enum(["provider", "offering", "package"]),
  item_id: z.string().uuid(),
});

async function getOrCreateDefaultWishlistId(userId: string): Promise<string> {
  const supabase = await getSupabaseServer();

  const { data: existing, error: existingError } = await (supabase.from("wishlists") as any)
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .single();

  if (!existingError && existing?.id) return existing.id as string;

  const { data: created, error: createError } = await (supabase.from("wishlists") as any)
    .insert({
      user_id: userId,
      name: "Favorites",
      is_default: true,
      is_public: false,
    })
    .select("id")
    .single();

  if (createError) throw createError;
  return created.id as string;
}

/**
 * POST /api/me/wishlists/toggle
 *
 * Adds/removes an item from a wishlist. If wishlist_id not provided, uses default wishlist.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer();

    const body = toggleSchema.parse(await request.json());

    const wishlistId = body.wishlist_id || (await getOrCreateDefaultWishlistId(user.id));

    // Ensure wishlist belongs to user
    const { data: wishlist, error: wlError } = await (supabase.from("wishlists") as any)
      .select("id")
      .eq("id", wishlistId)
      .eq("user_id", user.id)
      .single();
    if (wlError || !wishlist) {
      return successResponse({ success: false, message: "Wishlist not found" }, 404);
    }

    const { data: existing, error: existingError } = await (supabase.from("wishlist_items") as any)
      .select("id")
      .eq("wishlist_id", wishlistId)
      .eq("item_type", body.item_type)
      .eq("item_id", body.item_id)
      .maybeSingle();

    if (existingError && existingError.code !== "PGRST116") {
      // PGRST116: "Results contain 0 rows" for maybeSingle in some setups
      throw existingError;
    }

    if (existing?.id) {
      const { error: delError } = await (supabase.from("wishlist_items") as any)
        .delete()
        .eq("id", existing.id)
        .eq("wishlist_id", wishlistId);
      if (delError) throw delError;
      return successResponse({ success: true, action: "removed", wishlist_id: wishlistId });
    }

    const { error: insError } = await (supabase.from("wishlist_items") as any).insert({
      wishlist_id: wishlistId,
      item_type: body.item_type,
      item_id: body.item_id,
    });
    if (insError) throw insError;

    return successResponse({ success: true, action: "added", wishlist_id: wishlistId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(new Error(error.issues.map((e) => e.message).join(", ")), "Validation failed");
    }
    return handleApiError(error, "Failed to toggle wishlist item");
  }
}

