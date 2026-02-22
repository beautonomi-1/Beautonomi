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

const updateSchema = z.object({
  offers_delivery: z.boolean().optional(),
  offers_collection: z.boolean().optional(),
  delivery_fee: z.number().min(0).optional(),
  free_delivery_threshold: z.number().min(0).nullable().optional(),
  delivery_radius_km: z.number().min(0).nullable().optional(),
  estimated_delivery_days: z.number().int().min(1).optional(),
  delivery_notes: z.string().max(500).nullable().optional(),
});

/**
 * GET /api/provider/shipping-config
 * Get current shipping configuration
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data, error } = await (supabase.from("provider_shipping_config") as any)
      .select("*")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error) throw error;

    // Return defaults if no config exists
    const config = data ?? {
      provider_id: providerId,
      offers_delivery: false,
      offers_collection: true,
      delivery_fee: 0,
      free_delivery_threshold: null,
      delivery_radius_km: null,
      estimated_delivery_days: 3,
      delivery_notes: null,
    };

    return successResponse({ config });
  } catch (err) {
    return handleApiError(err, "Failed to fetch shipping config");
  }
}

/**
 * PUT /api/provider/shipping-config
 * Create or update shipping configuration (upsert)
 */
export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const body = await request.json();
    const parsed = updateSchema.parse(body);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: existing } = await (supabase.from("provider_shipping_config") as any)
      .select("id")
      .eq("provider_id", providerId)
      .maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await (supabase.from("provider_shipping_config") as any)
        .update(parsed)
        .eq("provider_id", providerId)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await (supabase.from("provider_shipping_config") as any)
        .insert({ provider_id: providerId, ...parsed })
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    return successResponse({ config: result });
  } catch (err) {
    return handleApiError(err, "Failed to update shipping config");
  }
}
