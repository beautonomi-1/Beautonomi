import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";

const createGiftCardSchema = z.object({
  code: z.string().min(1, "Code is required"),
  initial_balance: z.number().positive("Initial balance must be positive"),
  currency: z.string().min(3).max(6).default("ZAR"),
  expires_at: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * GET /api/admin/gift-cards
 * List all gift cards (superadmin only)
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"]);

    const supabaseAdmin = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from("gift_cards")
      .select("*", { count: "exact" })
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
 * Create a new gift card (superadmin only)
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"]);

    const supabaseAdmin = getSupabaseAdmin();

    const body = await request.json();
    const validationResult = createGiftCardSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validationResult.error.issues);
    }

    const { code, initial_balance, currency, expires_at, metadata } = validationResult.data;

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
        currency,
        expires_at: expires_at ? new Date(expires_at).toISOString() : null,
        metadata: metadata || {},
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    return successResponse({ gift_card: giftCard });
  } catch (error) {
    return handleApiError(error, "Failed to create gift card");
  }
}
