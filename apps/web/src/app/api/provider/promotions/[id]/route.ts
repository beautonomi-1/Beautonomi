import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  badRequestResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import {
  assertProviderOwnsLocation,
  getProviderTimezoneAndTenant,
  parseOptionalAmount,
  parseOptionalLimit,
} from "@/lib/promotions/provider-promotion-api";
import {
  mapPromotionRowToProviderDto,
  promoEndInstantFromYmd,
  promoStartInstantFromYmd,
} from "@/lib/promotions/provider-promotion";

/**
 * GET /api/provider/promotions/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("manage_marketing", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const meta = await getProviderTimezoneAndTenant(supabase, providerId);
    if (!meta) {
      return badRequestResponse("Provider tenant not found");
    }

    const { data: promotion, error } = await supabase
      .from("promotions")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !promotion) {
      return notFoundResponse("Promotion not found");
    }

    return successResponse(
      mapPromotionRowToProviderDto(promotion as Record<string, unknown>, meta.timezone),
    );
  } catch (error) {
    return handleApiError(error, "Failed to fetch promotion");
  }
}

/**
 * PATCH /api/provider/promotions/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("manage_marketing", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const meta = await getProviderTimezoneAndTenant(supabase, providerId);
    if (!meta) {
      return badRequestResponse("Provider tenant not found");
    }
    const { timezone } = meta;

    const { data: existing, error: fetchErr } = await supabase
      .from("promotions")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (fetchErr || !existing) {
      return notFoundResponse("Promotion not found");
    }

    const row = existing as Record<string, unknown>;
    const usageCount = Number(row.usage_count ?? 0);
    const dbType = String(row.type ?? "fixed");

    const updateData: Record<string, unknown> = {};

    if (body.description !== undefined) updateData.description = body.description;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.public_on_profile !== undefined) {
      updateData.public_on_profile = Boolean(body.public_on_profile);
    }
    if (body.once_per_customer !== undefined) {
      updateData.once_per_customer = Boolean(body.once_per_customer);
    }

    if (body.usage_limit !== undefined || body.max_uses !== undefined) {
      const raw = body.usage_limit !== undefined ? body.usage_limit : body.max_uses;
      if (raw === null || raw === "") {
        updateData.usage_limit = null;
      } else {
        const limit = parseOptionalLimit(raw);
        if (limit == null) {
          return badRequestResponse("Usage limit must be at least 1 when set");
        }
        if (limit < usageCount) {
          return badRequestResponse("Usage limit cannot be below current redemptions");
        }
        updateData.usage_limit = limit;
      }
    }

    if (body.min_purchase_amount !== undefined || body.min_booking_amount !== undefined) {
      const raw =
        body.min_purchase_amount !== undefined
          ? body.min_purchase_amount
          : body.min_booking_amount;
      updateData.min_purchase_amount =
        raw === null || raw === "" ? null : parseOptionalAmount(raw);
    }

    if (body.max_discount_amount !== undefined) {
      if (dbType === "fixed") {
        return badRequestResponse("Max discount applies to percentage promotions only");
      }
      const raw = body.max_discount_amount;
      updateData.max_discount_amount =
        raw === null || raw === "" ? null : parseOptionalAmount(raw);
    }

    if (body.location_id !== undefined) {
      if (body.location_id === null || body.location_id === "") {
        updateData.location_id = null;
      } else {
        const loc = String(body.location_id);
        const ok = await assertProviderOwnsLocation(supabase, providerId, loc);
        if (!ok) return badRequestResponse("Invalid location for this provider");
        updateData.location_id = loc;
      }
    }

    if (usageCount === 0) {
      if (body.type !== undefined) {
        const t = body.type;
        if (!["percentage", "fixed", "fixed_amount"].includes(t)) {
          return badRequestResponse("Invalid promotion type");
        }
        updateData.type = t === "fixed_amount" ? "fixed" : t;
      }
      if (body.value !== undefined) {
        const value =
          typeof body.value === "number"
            ? body.value
            : parseFloat(String(body.value).replace(/,/g, "."));
        if (Number.isNaN(value)) {
          return badRequestResponse("Invalid numeric value for promotion");
        }
        updateData.value = value;
      }
    }

    const dto = mapPromotionRowToProviderDto(row, timezone);
    const startYmdForPatch =
      typeof body.start_date === "string" && body.start_date.trim()
        ? body.start_date.trim().slice(0, 10)
        : dto.start_date;

    if (body.no_end_date === true) {
      if (startYmdForPatch) {
        updateData.valid_from = promoStartInstantFromYmd(startYmdForPatch, timezone).toISOString();
      }
      updateData.valid_until = null;
    } else if (body.end_date !== undefined) {
      if (body.end_date === null || body.end_date === "") {
        updateData.valid_until = null;
      } else if (typeof body.end_date === "string" && body.end_date.trim() && startYmdForPatch) {
        const endYmd = body.end_date.trim().slice(0, 10);
        const validFrom = promoStartInstantFromYmd(startYmdForPatch, timezone);
        const validUntil = promoEndInstantFromYmd(endYmd, timezone);
        if (validUntil.getTime() <= validFrom.getTime()) {
          return badRequestResponse("End date must be after start date");
        }
        updateData.valid_from = validFrom.toISOString();
        updateData.valid_until = validUntil.toISOString();
      }
    } else if (typeof body.start_date === "string" && body.start_date.trim()) {
      const startYmd = body.start_date.trim().slice(0, 10);
      updateData.valid_from = promoStartInstantFromYmd(startYmd, timezone).toISOString();
      if (dto.end_date) {
        const validUntil = promoEndInstantFromYmd(dto.end_date, timezone);
        const validFrom = promoStartInstantFromYmd(startYmd, timezone);
        if (validUntil.getTime() <= validFrom.getTime()) {
          return badRequestResponse("End date must be after start date");
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return successResponse(mapPromotionRowToProviderDto(row, timezone));
    }

    const { data: promotion, error } = await supabase
      .from("promotions")
      .update(updateData)
      .eq("id", id)
      .eq("provider_id", providerId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(
      mapPromotionRowToProviderDto(promotion as Record<string, unknown>, timezone),
    );
  } catch (error) {
    return handleApiError(error, "Failed to update promotion");
  }
}

/**
 * DELETE /api/provider/promotions/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("manage_marketing", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return badRequestResponse("Provider not found");
    }

    const { data: existing } = await supabase
      .from("promotions")
      .select("id, usage_count")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (!existing) {
      return notFoundResponse("Promotion not found");
    }

    const usageCount = Number((existing as { usage_count?: number }).usage_count ?? 0);
    if (usageCount > 0) {
      return errorResponse(
        "This promo code has been used. Turn it off instead of deleting it.",
        "PROMOTION_IN_USE",
        409,
      );
    }

    const { error } = await supabase
      .from("promotions")
      .delete()
      .eq("id", id)
      .eq("provider_id", providerId);

    if (error) {
      throw error;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete promotion");
  }
}
