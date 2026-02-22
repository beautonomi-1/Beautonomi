import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const checkSchema = z.object({
  item_type: z.enum(["provider", "offering", "package"]),
  item_id: z.string().uuid(),
});

/**
 * POST /api/me/wishlists/check
 * 
 * Quickly checks if an item is in any of the user's wishlists.
 * Returns { is_in_wishlist: boolean, wishlist_id?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer();

    const body = checkSchema.parse(await request.json());

    // Get all wishlists for the user
    const { data: wishlists, error: wishlistsError } = await supabase
      .from("wishlists")
      .select("id")
      .eq("user_id", user.id);

    if (wishlistsError) {
      throw wishlistsError;
    }

    if (!wishlists || wishlists.length === 0) {
      return successResponse({ is_in_wishlist: false });
    }

    const wishlistIds = wishlists.map((w: any) => w.id);

    // Check if item exists in any wishlist
    const { data: item, error: itemError } = await supabase
      .from("wishlist_items")
      .select("wishlist_id")
      .eq("item_type", body.item_type)
      .eq("item_id", body.item_id)
      .in("wishlist_id", wishlistIds)
      .maybeSingle();

    if (itemError && itemError.code !== "PGRST116") {
      // PGRST116: "Results contain 0 rows" for maybeSingle
      throw itemError;
    }

    return successResponse({
      is_in_wishlist: !!item,
      wishlist_id: item?.wishlist_id || null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(new Error(error.issues.map((e) => e.message).join(", ")), "Validation failed");
    }
    return handleApiError(error, "Failed to check wishlist status");
  }
}
