import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * DELETE /api/me/gift-cards/[id]
 *
 * "Remove from my wallet" — inserts a per-user hide row so the card stops
 * appearing in GET /api/me/gift-cards for this user.
 *
 * Does NOT modify the underlying gift_cards record; the card remains valid
 * for finance/audit and other users who legitimately hold it.
 *
 * Ownership is verified using the same three sources as the GET list:
 *   1. Purchaser via gift_card_orders
 *   2. Redeemer via gift_card_redemptions
 *   3. Recipient via gift_cards.metadata.recipient_email
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();

    // Verify the card exists.
    const { data: card, error: cardErr } = await supabaseAdmin
      .from("gift_cards")
      .select("id, metadata")
      .eq("id", id)
      .maybeSingle();

    if (cardErr) throw cardErr;
    if (!card) return notFoundResponse("Gift card not found");

    // Confirm this user legitimately holds visibility of this card before hiding.
    let hasAccess = false;

    // 1. Purchased by this user
    const { data: orders } = await supabase
      .from("gift_card_orders")
      .select("id, gift_card_id")
      .eq("purchaser_user_id", user.id)
      .eq("status", "paid");

    for (const o of orders || []) {
      if (o.gift_card_id === id) { hasAccess = true; break; }
    }

    // 1b. Bulk-order sibling
    if (!hasAccess && (orders || []).length > 0) {
      const paidOrderIds = (orders || [])
        .map((o) => o.id)
        .filter((oid): oid is string => typeof oid === "string" && oid.length > 0);
      if (paidOrderIds.length > 0) {
        const orFilter = paidOrderIds.map((oid) => `metadata->>order_id.eq.${oid}`).join(",");
        const { data: bulkCards } = await supabaseAdmin
          .from("gift_cards")
          .select("id")
          .eq("id", id)
          .or(orFilter);
        if ((bulkCards || []).length > 0) hasAccess = true;
      }
    }

    // 2. Redeemed by this user
    if (!hasAccess) {
      const { data: redemptions } = await supabase
        .from("gift_card_redemptions")
        .select("gift_card_id")
        .eq("user_id", user.id)
        .eq("gift_card_id", id);
      if ((redemptions || []).length > 0) hasAccess = true;
    }

    // 3. Recipient email match
    if (!hasAccess && user.email) {
      const recipient = (card.metadata as Record<string, unknown>)?.recipient_email;
      if (
        typeof recipient === "string" &&
        recipient.trim().toLowerCase() === user.email.trim().toLowerCase()
      ) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return errorResponse(
        "This gift card is not in your wallet",
        "FORBIDDEN",
        403
      );
    }

    // Idempotent upsert — safe to call multiple times.
    const { error: hideErr } = await supabaseAdmin
      .from("user_gift_card_hides")
      .upsert(
        { user_id: user.id, gift_card_id: id },
        { onConflict: "user_id,gift_card_id" }
      );
    if (hideErr) throw hideErr;

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "customer",
      action: "customer.gift_card.hide",
      entity_type: "gift_card",
      entity_id: id,
      module: "wallet",
      risk_level: "low",
      retention_tier: "routine",
      metadata: {},
      ...extractRequestMeta(request),
    });

    return successResponse({ hidden: true });
  } catch (error) {
    return handleApiError(error, "Failed to remove gift card");
  }
}
