import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  successResponse,
  badRequestResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import {
  assertProviderOwnsLocation,
  getProviderTimezoneAndTenant,
  mapRowsToProviderDtos,
  parseOptionalAmount,
  parseOptionalLimit,
  resolveValidWindowFromBody,
} from "@/lib/promotions/provider-promotion-api";
import { mapPromotionRowToProviderDto } from "@/lib/promotions/provider-promotion";

/**
 * GET /api/provider/promotions
 *
 * List all promotions for the provider
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("manage_marketing", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const meta = await getProviderTimezoneAndTenant(supabase, providerId);
    if (!meta) {
      return badRequestResponse("Provider tenant not found");
    }

    const { data: promotions, error } = await supabase
      .from("promotions")
      .select("*")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return successResponse(mapRowsToProviderDtos(promotions as Record<string, unknown>[], meta.timezone));
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
    const permissionCheck = await requirePermission("manage_marketing", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const meta = await getProviderTimezoneAndTenant(supabase, providerId);
    if (!meta) {
      return badRequestResponse("Provider tenant not found");
    }
    const { tenantId, timezone } = meta;

    const { code, type, value: rawValue, description } = body;
    if (!code || !type || rawValue === undefined || rawValue === null) {
      return badRequestResponse("Missing required fields: code, type, value");
    }
    const value =
      typeof rawValue === "number" ? rawValue : parseFloat(String(rawValue).replace(/,/g, "."));
    if (Number.isNaN(value)) {
      return badRequestResponse("Invalid numeric value for promotion");
    }

    if (!["percentage", "fixed", "fixed_amount"].includes(type)) {
      return badRequestResponse("Type must be 'percentage' or 'fixed' (or 'fixed_amount')");
    }
    const dbType = type === "fixed_amount" ? "fixed" : type;

    if (type === "percentage" && (value < 0 || value > 100)) {
      return badRequestResponse("Percentage value must be between 0 and 100");
    }

    if (dbType === "fixed" && value <= 0) {
      return badRequestResponse("Fixed amount value must be greater than 0");
    }

    const usageLimit = parseOptionalLimit(body.usage_limit ?? body.max_uses);
    if (
      (body.usage_limit != null && body.usage_limit !== "") ||
      (body.max_uses != null && body.max_uses !== "")
    ) {
      if (usageLimit == null) {
        return badRequestResponse("Usage limit must be at least 1 when set");
      }
    }

    const maxDiscount = parseOptionalAmount(body.max_discount_amount);
    if (dbType === "fixed" && maxDiscount != null) {
      return badRequestResponse("Max discount applies to percentage promotions only");
    }

    const locationId =
      typeof body.location_id === "string" && body.location_id.trim()
        ? body.location_id.trim()
        : null;
    if (locationId) {
      const ok = await assertProviderOwnsLocation(supabase, providerId, locationId);
      if (!ok) return badRequestResponse("Invalid location for this provider");
    }

    const window = resolveValidWindowFromBody(body, timezone);
    if ("error" in window) {
      return badRequestResponse(window.error);
    }

    const { data: existing } = await supabase
      .from("promotions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("provider_id", providerId)
      .eq("code", String(code).toUpperCase())
      .maybeSingle();

    if (existing) {
      return badRequestResponse("A promotion with this code already exists");
    }

    const upperCode = String(code).toUpperCase();
    const minPurchase = parseOptionalAmount(body.min_purchase_amount ?? body.min_booking_amount);

    const insertRow: Record<string, unknown> = {
      tenant_id: tenantId,
      provider_id: providerId,
      code: upperCode,
      name: body.name || upperCode,
      description: description || null,
      type: dbType,
      value,
      min_purchase_amount: minPurchase,
      max_discount_amount: maxDiscount,
      valid_from: window.validFrom.toISOString(),
      valid_until: window.validUntil ? window.validUntil.toISOString() : null,
      usage_limit: usageLimit,
      usage_count: 0,
      is_active: body.is_active !== undefined ? body.is_active : true,
      public_on_profile:
        body.public_on_profile !== undefined ? Boolean(body.public_on_profile) : true,
      once_per_customer: Boolean(body.once_per_customer),
      location_id: locationId,
    };

    const { data: promotion, error } = await supabase
      .from("promotions")
      .insert(insertRow)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(mapPromotionRowToProviderDto(promotion as Record<string, unknown>, timezone));
  } catch (error) {
    return handleApiError(error, "Failed to create promotion");
  }
}
