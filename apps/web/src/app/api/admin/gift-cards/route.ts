import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { z } from "zod";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const createGiftCardSchema = z.object({
  code: z.string().min(1, "Code is required"),
  initial_balance: z.number().positive("Initial balance must be positive"),
  currency: z.string().min(3).max(6).optional(),
  expires_at: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * GET /api/admin/gift-cards
 * List gift cards for the resolved admin tenant (Host → tenant_domains / za fallback).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);

    const supabaseAdmin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from("gift_cards")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Search by code or metadata (recipient email)
    if (search) {
      query = query.or(`code.ilike.%${search}%,metadata->>recipient_email.ilike.%${search}%`);
    }

    // Filter by status
    if (status === "active") {
      query = query.eq("is_active", true).gt("balance", 0);
    } else if (status === "inactive") {
      query = query.eq("is_active", false);
    } else if (status === "expired") {
      query = query.lt("expires_at", new Date().toISOString());
    } else if (status === "zero_balance") {
      query = query.eq("balance", 0);
    }

    const { data: giftCards, error, count } = await query;

    if (error) throw error;

    return successResponse({
      gift_cards: giftCards || [],
      meta: {
        total: count || 0,
        page,
        limit,
        has_more: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch gift cards");
  }
}

/**
 * POST /api/admin/gift-cards
 * Create a gift card in the resolved admin tenant.
 */
export async function POST(request: NextRequest) {
  try {
    const { user: admin } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);

    const supabaseAdmin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const lastResortCurrency =
      (await getTenantRegionConfig(tenantId))?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const body = await request.json();
    const validationResult = createGiftCardSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validationResult.error.issues);
    }

    const { code, initial_balance, currency, expires_at, metadata } = validationResult.data;
    const resolvedCurrency = currency ?? lastResortCurrency;

    // Check if code already exists
    const { data: existing } = await supabaseAdmin
      .from("gift_cards")
      .select("id")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    if (existing) {
      return errorResponse("Gift card code already exists", "DUPLICATE_CODE", 409);
    }

    const { data: giftCard, error } = await supabaseAdmin
      .from("gift_cards")
      .insert({
        code: code.toUpperCase(),
        initial_balance,
        balance: initial_balance,
        currency: resolvedCurrency,
        expires_at: expires_at ? new Date(expires_at).toISOString() : null,
        metadata: metadata || {},
        is_active: true,
        tenant_id: tenantId,
      })
      .select()
      .single();

    if (error) throw error;

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: admin.id,
      actor_role: admin.role,
      action: "admin.gift_card.create",
      entity_type: "gift_card",
      entity_id: giftCard.id,
      module: "marketing",
      risk_level: "critical",
      retention_tier: "operational",
      status: "succeeded",
      after_json: { code: code.toUpperCase(), initial_balance, currency: resolvedCurrency },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ gift_card: giftCard });
  } catch (error) {
    return handleApiError(error, "Failed to create gift card");
  }
}
