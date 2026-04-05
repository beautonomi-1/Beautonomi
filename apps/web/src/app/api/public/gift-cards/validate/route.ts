import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isGiftCardsEnabledForTenant } from "@/lib/subscriptions/entitlements";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/**
 * GET /api/public/gift-cards/validate?code=XXX
 *
 * Authenticated validation endpoint for gift cards.
 * Returns: { valid, balance, currency, message }
 */
export async function GET(request: Request) {
  try {
    let tenantId: string | null = null;
    try {
      tenantId = await resolveTenantIdWithZaFallback(request);
    } catch (tenantErr) {
      console.warn("Tenant resolution failed in /api/public/gift-cards/validate (continuing without tenant):", tenantErr);
      tenantId = null;
    }
    const tenantRegion = tenantId ? await getTenantRegionConfig(tenantId) : null;
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const giftCardsEnabled = await isGiftCardsEnabledForTenant(tenantId);
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
      currency: card.currency || lastResortCurrency,
    });
  } catch {
    return NextResponse.json({ valid: false, message: "Failed to validate gift card" }, { status: 500 });
  }
}

