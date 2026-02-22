import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/auth-server";

export async function GET(_request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { user } = await requireRole(["customer", "provider_owner", "provider_staff"]);

    // Get gift cards from orders purchased by user
    const { data: orders } = await supabase
      .from("gift_card_orders")
      .select("gift_card_id")
      .eq("purchaser_user_id", user.id)
      .eq("status", "paid")
      .not("gift_card_id", "is", null);

    const giftCardIds = (orders || [])
      .map((o: any) => o.gift_card_id)
      .filter((id: string) => id !== null);

    if (giftCardIds.length === 0) {
      return NextResponse.json({ gift_cards: [] });
    }

    // Get gift cards
    const { data: giftCards, error } = await supabase
      .from("gift_cards")
      .select("*")
      .in("id", giftCardIds)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Also get gift cards from redemptions (gift cards used by this user)
    const { data: redemptions } = await supabase
      .from("gift_card_redemptions")
      .select("gift_card_id")
      .eq("user_id", user.id);

    const redeemedGiftCardIds = (redemptions || [])
      .map((r: any) => r.gift_card_id)
      .filter((id: string) => id !== null && !giftCardIds.includes(id));

    if (redeemedGiftCardIds.length > 0) {
      const { data: redeemedCards } = await supabase
        .from("gift_cards")
        .select("*")
        .in("id", redeemedGiftCardIds)
        .order("created_at", { ascending: false });

      if (redeemedCards) {
        giftCards?.push(...redeemedCards);
      }
    }

    return NextResponse.json({
      gift_cards: giftCards || [],
    });
  } catch (error: any) {
    console.error("Error fetching user gift cards:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch gift cards" },
      { status: 500 }
    );
  }
}
