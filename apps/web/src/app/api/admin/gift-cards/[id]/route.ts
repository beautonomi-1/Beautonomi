import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse, notFoundResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";

const updateGiftCardSchema = z.object({
  balance: z.number().min(0, "Balance cannot be negative").optional(),
  expires_at: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * GET /api/admin/gift-cards/[id]
 * Get gift card details with redemptions (superadmin only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRoleInApi(["superadmin"], request);

    const supabaseAdmin = getSupabaseAdmin();

    const { id } = params;

    // Get gift card with redemptions
    const { data: giftCard, error: giftCardError } = await supabaseAdmin
      .from("gift_cards")
      .select("*")
      .eq("id", id)
      .single();

    if (giftCardError || !giftCard) {
      return notFoundResponse("Gift card not found");
    }

    // Get redemptions
    const { data: redemptions, error: redemptionsError } = await supabaseAdmin
      .from("gift_card_redemptions")
      .select("id, booking_id, amount, currency, status, created_at, captured_at, voided_at")
      .eq("gift_card_id", id)
      .order("created_at", { ascending: false });

    if (redemptionsError) {
      console.error("Error fetching redemptions:", redemptionsError);
      // Don't fail, just return gift card without redemptions
    }

    return successResponse({
      gift_card: {
        ...giftCard,
        redemptions: redemptions || [],
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch gift card");
  }
}

/**
 * PATCH /api/admin/gift-cards/[id]
 * Update gift card (superadmin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRoleInApi(["superadmin"], request);

    const supabaseAdmin = getSupabaseAdmin();

    const { id } = params;
    const body = await request.json();
    const validationResult = updateGiftCardSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validationResult.error.issues);
    }

    const updateData: any = {};
    if (validationResult.data.balance !== undefined) {
      updateData.balance = validationResult.data.balance;
    }
    if (validationResult.data.expires_at !== undefined) {
      updateData.expires_at = validationResult.data.expires_at
        ? new Date(validationResult.data.expires_at).toISOString()
        : null;
    }
    if (validationResult.data.is_active !== undefined) {
      updateData.is_active = validationResult.data.is_active;
    }
    if (validationResult.data.metadata !== undefined) {
      updateData.metadata = validationResult.data.metadata;
    }

    const { data: giftCard, error } = await supabaseAdmin
      .from("gift_cards")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return notFoundResponse("Gift card not found");
      }
      throw error;
    }

    return successResponse({ gift_card: giftCard });
  } catch (error) {
    return handleApiError(error, "Failed to update gift card");
  }
}

/**
 * DELETE /api/admin/gift-cards/[id]
 * Delete gift card (superadmin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRoleInApi(["superadmin"], request);

    const supabaseAdmin = getSupabaseAdmin();

    const { id } = params;

    const { error } = await supabaseAdmin.from("gift_cards").delete().eq("id", id);

    if (error) {
      if (error.code === "PGRST116") {
        return notFoundResponse("Gift card not found");
      }
      throw error;
    }

    return successResponse({ message: "Gift card deleted successfully" });
  } catch (error) {
    return handleApiError(error, "Failed to delete gift card");
  }
}
