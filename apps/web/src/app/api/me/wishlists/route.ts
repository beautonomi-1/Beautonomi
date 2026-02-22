import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(80, "Name is too long"),
  is_public: z.boolean().optional(),
});

async function ensureDefaultWishlist(userId: string) {
  const supabase = await getSupabaseServer();

  const { data: existing, error: listError } = await (supabase.from("wishlists") as any)
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .limit(1);

  if (listError) throw listError;
  if (existing && existing.length > 0) return existing[0].id as string;

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
 * GET /api/me/wishlists
 *
 * Lists the current user's wishlists with item counts and simple cover images.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer();

    // Ensure default wishlist exists
    try {
      await ensureDefaultWishlist(user.id);
    } catch (ensureError) {
      console.error("Error ensuring default wishlist:", ensureError);
      // Continue even if default wishlist creation fails
    }

    const { data: wishlists, error: wishlistError } = await (supabase.from("wishlists") as any)
      .select("id, name, is_default, is_public, created_at, updated_at")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });

    if (wishlistError) {
      console.error("Error fetching wishlists:", wishlistError);
      throw wishlistError;
    }

    const wishlistIds = (wishlists || []).map((w: any) => w.id);
    if (wishlistIds.length === 0) return successResponse([]);

    const { data: items, error: itemsError } = await (supabase.from("wishlist_items") as any)
      .select("wishlist_id, item_type, item_id, created_at")
      .in("wishlist_id", wishlistIds)
      .order("created_at", { ascending: false });

    if (itemsError) {
      console.error("Error fetching wishlist items:", itemsError);
      throw itemsError;
    }

    const itemsByWishlist = new Map<string, any[]>();
    for (const item of items || []) {
      const key = item.wishlist_id as string;
      if (!itemsByWishlist.has(key)) itemsByWishlist.set(key, []);
      itemsByWishlist.get(key)!.push(item);
    }

    const providerItemIds = Array.from(
      new Set((items || []).filter((i: any) => i.item_type === "provider").map((i: any) => i.item_id))
    );

    const providerThumbs = new Map<string, string>();
    if (providerItemIds.length > 0) {
      try {
        const { data: providers, error: provError } = await (supabase.from("providers") as any)
          .select("id, thumbnail_url")
          .in("id", providerItemIds);
        if (provError) {
          console.error("Error fetching provider thumbnails:", provError);
          // Continue without thumbnails if this fails
        } else {
          for (const p of providers || []) {
            if (p?.thumbnail_url) providerThumbs.set(p.id, p.thumbnail_url);
          }
        }
      } catch (thumbError) {
        console.error("Error fetching provider thumbnails:", thumbError);
        // Continue without thumbnails
      }
    }

    const response = (wishlists || []).map((w: any) => {
      const wlItems = itemsByWishlist.get(w.id) || [];
      const providerCoverImages: string[] = [];
      for (const i of wlItems) {
        if (i.item_type !== "provider") continue;
        const url = providerThumbs.get(i.item_id);
        if (url) providerCoverImages.push(url);
        if (providerCoverImages.length >= 4) break;
      }
      return {
        ...w,
        item_count: wlItems.length,
        cover_images: providerCoverImages,
      };
    });

    return successResponse(response);
  } catch (error) {
    return handleApiError(error, "Failed to load wishlists");
  }
}

/**
 * POST /api/me/wishlists
 *
 * Creates a new wishlist for the current user.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer();

    const body = createSchema.parse(await request.json());

    const { data: created, error } = await (supabase.from("wishlists") as any)
      .insert({
        user_id: user.id,
        name: body.name,
        is_default: false,
        is_public: body.is_public ?? false,
      })
      .select("id, name, is_default, is_public, created_at, updated_at")
      .single();

    if (error) throw error;
    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(new Error(error.issues.map((e) => e.message).join(", ")), "Validation failed");
    }
    return handleApiError(error, "Failed to create wishlist");
  }
}

