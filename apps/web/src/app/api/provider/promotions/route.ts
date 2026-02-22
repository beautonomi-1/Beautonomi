import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, badRequestResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/promotions
 * 
 * List all promotions for the provider
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    // Fetch promotions
    const { data: promotions, error } = await supabase
      .from("promotions")
      .select("*")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return successResponse(promotions || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch promotions");
  }
}

/**
 * POST /api/provider/promotions
 * 
 * Create a new promotion/promo code
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    // Validate required fields
    const { code, type, value, description } = body;
    if (!code || !type || value === undefined) {
      return badRequestResponse("Missing required fields: code, type, value");
    }

    // Validate type
    if (!['percentage', 'fixed_amount'].includes(type)) {
      return badRequestResponse("Type must be 'percentage' or 'fixed_amount'");
    }

    // Validate value
    if (type === 'percentage' && (value < 0 || value > 100)) {
      return badRequestResponse("Percentage value must be between 0 and 100");
    }

    if (type === 'fixed_amount' && value < 0) {
      return badRequestResponse("Fixed amount value must be greater than 0");
    }

    // Check if code already exists for this provider
    const { data: existing } = await supabase
      .from("promotions")
      .select("id")
      .eq("provider_id", providerId)
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (existing) {
      return badRequestResponse("A promotion with this code already exists");
    }

    // Create promotion
    const { data: promotion, error } = await supabase
      .from("promotions")
      .insert({
        provider_id: providerId,
        code: code.toUpperCase(),
        type,
        value,
        description: description || null,
        min_booking_amount: body.min_booking_amount || null,
        max_uses: body.max_uses || null,
        uses_count: 0,
        start_date: body.start_date || null,
        end_date: body.end_date || null,
        is_active: body.is_active !== undefined ? body.is_active : true,
        currency: body.currency || "ZAR",
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(promotion);
  } catch (error) {
    return handleApiError(error, "Failed to create promotion");
  }
}
