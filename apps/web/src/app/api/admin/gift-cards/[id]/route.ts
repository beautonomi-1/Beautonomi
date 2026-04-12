import { NextRequest } from "next/server";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_MARKETING_COMMS } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { z } from "zod";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const updateGiftCardSchema = z.object({
  balance: z.number().min(0, "Balance cannot be negative").optional(),
  expires_at: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * GET /api/admin/gift-cards/[id]
 * Gift card in the resolved admin tenant, with redemptions on bookings in that tenant.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);

    const supabaseAdmin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;

    const { data: giftCard, error: giftCardError } = await supabaseAdmin
      .from("gift_cards")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (giftCardError || !giftCard) {
      return notFoundResponse("Gift card not found");
    }

    const { data: redemptions, error: redemptionsError } = await supabaseAdmin
      .from("gift_card_redemptions")
      .select(
        "id, booking_id, amount, currency, status, created_at, captured_at, voided_at, bookings!inner(tenant_id)"
      )
      .eq("gift_card_id", id)
      .eq("bookings.tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (redemptionsError) {
      console.error("Error fetching redemptions:", redemptionsError);
    }

    const gc = giftCard as Record<string, any>;
    return successResponse({
      gift_card: {
        ...gc,
        redemptions: redemptions || [],
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch gift card");
  }
}

/**
 * PATCH /api/admin/gift-cards/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);

    const supabaseAdmin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;
    const body = await request.json();
    const validationResult = updateGiftCardSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validationResult.error.issues);
    }

    const updateData: Record<string, unknown> = {};
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
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return notFoundResponse("Gift card not found");
      }
      throw error;
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: admin.id,
      actor_role: admin.role,
      action: "admin.gift_card.update",
      entity_type: "gift_card",
      entity_id: id,
      module: "marketing",
      risk_level: "critical",
      retention_tier: "operational",
      status: "succeeded",
      after_json: updateData as Record<string, any>,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ gift_card: giftCard });
  } catch (error) {
    return handleApiError(error, "Failed to update gift card");
  }
}

/**
 * DELETE /api/admin/gift-cards/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin } = await requireAdminSection(ADMIN_SECTION_MARKETING_COMMS, request);

    const supabaseAdmin = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;

    const { data: deleted, error } = await supabaseAdmin
      .from("gift_cards")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!deleted) {
      return notFoundResponse("Gift card not found");
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: admin.id,
      actor_role: admin.role,
      action: "admin.gift_card.delete",
      entity_type: "gift_card",
      entity_id: id,
      module: "marketing",
      risk_level: "critical",
      retention_tier: "operational",
      status: "succeeded",
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ message: "Gift card deleted successfully" });
  } catch (error) {
    return handleApiError(error, "Failed to delete gift card");
  }
}
