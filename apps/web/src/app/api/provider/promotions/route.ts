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
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const { data: provRow, error: provRowErr } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .single();
    if (provRowErr || !provRow?.tenant_id) {
      return badRequestResponse("Provider tenant not found");
    }
    const tenantId = provRow.tenant_id as string;

    // Validate required fields
    const { code, type, value: rawValue, description } = body;
    if (!code || !type || rawValue === undefined || rawValue === null) {
      return badRequestResponse("Missing required fields: code, type, value");
    }
    const value =
      typeof rawValue === "number" ? rawValue : parseFloat(String(rawValue).replace(/,/g, "."));
    if (Number.isNaN(value)) {
      return badRequestResponse("Invalid numeric value for promotion");
    }

    // Validate type (DB enum is 'percentage' | 'fixed')
    if (!['percentage', 'fixed', 'fixed_amount'].includes(type)) {
      return badRequestResponse("Type must be 'percentage' or 'fixed' (or 'fixed_amount')");
    }
    const dbType = type === 'fixed_amount' ? 'fixed' : type;

    // Validate value
    if (type === 'percentage' && (value < 0 || value > 100)) {
      return badRequestResponse("Percentage value must be between 0 and 100");
    }

    if (dbType === "fixed" && value <= 0) {
      return badRequestResponse("Fixed amount value must be greater than 0");
    }

    // Check if code already exists for this provider
    const { data: existing } = await supabase
      .from("promotions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("provider_id", providerId)
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (existing) {
      return badRequestResponse("A promotion with this code already exists");
    }

    // Map API fields to table columns (promotions table: name, valid_from, valid_until, usage_limit, usage_count, min_purchase_amount, max_discount_amount)
    const upperCode = code.toUpperCase();
    const now = new Date();
    const validFrom = body.start_date ? new Date(body.start_date) : now;
    const validUntil = body.end_date ? new Date(body.end_date) : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    const { data: promotion, error } = await supabase
      .from("promotions")
      .insert({
        tenant_id: tenantId,
        provider_id: providerId,
        code: upperCode,
        name: body.name || upperCode,
        description: description || null,
        type: dbType,
        value,
        min_purchase_amount: body.min_booking_amount ?? body.min_purchase_amount ?? null,
        max_discount_amount: body.max_discount_amount ?? null,
        valid_from: validFrom.toISOString(),
        valid_until: validUntil.toISOString(),
        usage_limit: body.max_uses ?? null,
        usage_count: 0,
        is_active: body.is_active !== undefined ? body.is_active : true,
        public_on_profile: body.public_on_profile !== undefined ? Boolean(body.public_on_profile) : true,
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
