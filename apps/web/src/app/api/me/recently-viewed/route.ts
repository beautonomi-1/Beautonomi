import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const upsertSchema = z.object({
  provider_id: z.string().uuid("Invalid provider_id"),
});

/**
 * GET /api/me/recently-viewed
 *
 * Returns providers the current user has recently viewed (most recent first)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));

    // First, get the recently viewed records
    const { data: rows, error: rowsError } = await (supabase
      .from("recently_viewed_providers") as any)
      .select("viewed_at, provider_id")
      .eq("user_id", user.id)
      .order("viewed_at", { ascending: false })
      .limit(limit);

    if (rowsError) {
      console.error("Error fetching recently_viewed_providers:", {
        error: rowsError,
        message: rowsError.message,
        code: rowsError.code,
        details: rowsError.details,
        hint: rowsError.hint,
        userId: user.id,
      });
      
      // Check if it's a table not found error
      if (rowsError.message?.includes("does not exist") || rowsError.code === "42P01") {
        console.warn("recently_viewed_providers table not found - returning empty array");
        return successResponse([]);
      }
      
      // Check if it's an RLS/permission error
      if (rowsError.code === "42501" || rowsError.message?.includes("permission denied") || rowsError.message?.includes("row-level security")) {
        console.warn("RLS policy blocking access to recently_viewed_providers - returning empty array");
        return successResponse([]);
      }
      
      // For other errors, still return empty array to prevent page breakage
      console.warn("Unknown error fetching recently_viewed_providers - returning empty array:", rowsError);
      return successResponse([]);
    }

    if (!rows || rows.length === 0) {
      return successResponse([]);
    }

    // Extract provider IDs
    const providerIds = rows.map((r: any) => r.provider_id).filter(Boolean);

    if (providerIds.length === 0) {
      return successResponse([]);
    }

    // Fetch providers separately to avoid RLS issues with foreign key queries
    const { data: providers, error: providersError } = await (supabase
      .from("providers") as any)
      .select(`
        id,
        slug,
        business_name,
        business_type,
        rating,
        review_count,
        thumbnail_url,
        city,
        country,
        description,
        status,
        is_featured,
        is_verified,
        starting_price,
        currency
      `)
      .in("id", providerIds);

    if (providersError) {
      console.error("Error fetching providers for recently viewed:", {
        error: providersError,
        message: providersError.message,
        code: providersError.code,
        providerIds: providerIds.slice(0, 5), // Log first 5 IDs
      });
      
      // If providers can't be fetched, return empty array with viewed records
      // This way the user at least knows they have viewed items, even if we can't show details
      return successResponse([]);
    }

    // Create a map of provider_id -> viewed_at
    const viewedAtMap = new Map(rows.map((r: any) => [r.provider_id, r.viewed_at]));

    // Combine providers with viewed_at timestamps, maintaining order
    const providersWithViewedAt = (providers || [])
      .map((p: any) => ({
        ...p,
        viewed_at: viewedAtMap.get(p.id) || new Date().toISOString(),
      }))
      .sort((a: any, b: any) => {
        const aTime = new Date(a.viewed_at).getTime();
        const bTime = new Date(b.viewed_at).getTime();
        return bTime - aTime; // Most recent first
      });

    return successResponse(providersWithViewedAt);
  } catch (error) {
    console.error("Unexpected error in GET /api/me/recently-viewed:", error);
    // Return empty array instead of error to prevent page breakage
    return successResponse([]);
  }
}

/**
 * POST /api/me/recently-viewed
 *
 * Upserts a provider view for the current user
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer();

    const body = upsertSchema.parse(await request.json());
    const now = new Date().toISOString();

    const { error } = await (supabase.from("recently_viewed_providers") as any).upsert(
      {
        user_id: user.id,
        provider_id: body.provider_id,
        viewed_at: now,
      },
      { onConflict: "user_id,provider_id" }
    );

    if (error) throw error;

    return successResponse({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(new Error(error.issues.map((e) => e.message).join(", ")), "Validation failed");
    }
    return handleApiError(error, "Failed to track provider view");
  }
}

/**
 * DELETE /api/me/recently-viewed
 *
 * Clears recently viewed history (or removes a single provider if provider_id provided)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider_id");

    let query = (supabase.from("recently_viewed_providers") as any).delete().eq("user_id", user.id);
    if (providerId) query = query.eq("provider_id", providerId);

    const { error } = await query;
    if (error) throw error;

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to clear recently viewed providers");
  }
}

