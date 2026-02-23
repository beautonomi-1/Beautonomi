import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";

/**
 * GET /api/public/gift-cards/validate?code=XXX
 *
 * Authenticated validation endpoint for gift cards.
 * Returns: { valid, balance, currency, message }
 */
export async function GET(request: Request) {
  try {
    const giftCardsEnabled = await isFeatureEnabledServer("gift_cards");
    if (!giftCardsEnabled) {
      return NextResponse.json({ valid: false, message: "Gift cards are currently unavailable" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const code = (searchParams.get("code") || "").trim().toUpperCase();

    if (!code) {
      return NextResponse.json({ valid: false, message: "Gift card code is required" }, { status: 400 });
    }

    const supabase = await getSupabaseServer();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ valid: false, message: "Login required to use gift cards" }, { status: 401 });
    }

    const { data: card, error } = await (supabase.from("gift_cards") as any)
      .select("id, code, balance, currency, is_active, expires_at")
      .eq("code", code)
      .maybeSingle();

    if (error || !card) {
      return NextResponse.json({ valid: false, message: "Invalid gift card code" }, { status: 200 });
    }

    if (!card.is_active) return NextResponse.json({ valid: false, message: "Gift card is inactive" }, { status: 200 });
    if (card.expires_at && new Date(card.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, message: "Gift card has expired" }, { status: 200 });
    }

    return NextResponse.json({
      valid: true,
      balance: Number(card.balance || 0),
      currency: card.currency || "ZAR",
    });
  } catch {
    return NextResponse.json({ valid: false, message: "Failed to validate gift card" }, { status: 500 });
  }
}

