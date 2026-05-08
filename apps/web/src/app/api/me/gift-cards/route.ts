import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();

    const giftCardIds = new Set<string>();

    // 1) Gift cards from orders purchased by this user
    const { data: orders } = await supabase
      .from("gift_card_orders")
      .select("gift_card_id")
      .eq("purchaser_user_id", user.id)
      .eq("status", "paid")
      .not("gift_card_id", "is", null);

    for (const o of orders || []) {
      if (o.gift_card_id) giftCardIds.add(o.gift_card_id);
    }

    // 2) Gift cards from redemptions (used by this user at checkout)
    const { data: redemptions } = await supabase
      .from("gift_card_redemptions")
      .select("gift_card_id")
      .eq("user_id", user.id);

    for (const r of redemptions || []) {
      if (r.gift_card_id) giftCardIds.add(r.gift_card_id);
    }

    // 3) Admin-created gift cards assigned to this user's email (metadata.recipient_email)
    if (user.email) {
      const { data: allActive } = await supabaseAdmin
        .from("gift_cards")
        .select("id, metadata")
        .eq("is_active", true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

      const emailLower = user.email.trim().toLowerCase();
      for (const c of allActive || []) {
        const recipient = (c.metadata as Record<string, any>)?.recipient_email;
        if (typeof recipient === "string" && recipient.toLowerCase() === emailLower) {
          giftCardIds.add(c.id);
        }
      }
    }

    if (giftCardIds.size === 0) {
      return successResponse({ gift_cards: [] });
    }

    const ids = Array.from(giftCardIds);
    const { data: giftCards, error } = await supabase
      .from("gift_cards")
      .select("*")
      .in("id", ids)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return successResponse({ gift_cards: giftCards || [] });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to fetch gift cards");
  }
}
