import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/wishlists/[id]/items
 *
 * Get all items in a specific wishlist
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer();
    const { id: wishlistId } = await params;

    // Verify wishlist belongs to user
    const { data: wishlist, error: wlError } = await (supabase.from("wishlists") as any)
      .select("id")
      .eq("id", wishlistId)
      .eq("user_id", user.id)
      .single();

    if (wlError || !wishlist) {
      return successResponse([], 200); // Return empty array if wishlist not found
    }

    // Get items
    const { data: items, error: itemsError } = await (supabase.from("wishlist_items") as any)
      .select("id, item_type, item_id, created_at")
      .eq("wishlist_id", wishlistId)
      .order("created_at", { ascending: false });

    if (itemsError) throw itemsError;

    if (!items || items.length === 0) {
      return successResponse([]);
    }

    // Filter for provider items and get provider IDs
    const providerItems = items.filter((item: any) => item.item_type === "provider");
    const providerIds = providerItems.map((item: any) => item.item_id);

    if (providerIds.length === 0) {
      return successResponse([]);
    }

    // Fetch full provider data
    const { data: providers, error: providersError } = await (supabase.from("providers") as any)
      .select(`
        id,
        slug,
        business_name,
        business_type,
        rating_average,
        review_count,
        thumbnail_url,
        avatar_url,
        description,
        status,
        is_featured,
        is_verified,
        currency
      `)
      .in("id", providerIds)
      .eq("status", "active");

    if (providersError) {
      console.error("Error fetching providers:", providersError);
      throw providersError;
    }

    // Create a map of provider_id -> created_at (when it was added to wishlist)
    const addedAtMap = new Map(providerItems.map((item: any) => [item.item_id, item.created_at]));

    // Combine providers with added_at timestamp, maintaining order
    const providersWithAddedAt = (providers || [])
      .map((p: any) => ({
        ...p,
        added_at: addedAtMap.get(p.id) || new Date().toISOString(),
      }))
      .sort((a: any, b: any) => {
        const aTime = new Date(a.added_at).getTime();
        const bTime = new Date(b.added_at).getTime();
        return bTime - aTime; // Most recently added first
      });

    return successResponse(providersWithAddedAt);
  } catch (error) {
    return handleApiError(error, "Failed to load wishlist items");
  }
}
