import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { validatePromoCode } from "@/lib/promotions/validate";

/**
 * GET /api/public/promo-codes/validate?code=XXX&amount=123.45
 *
 * Lightweight public validation endpoint for promo codes (no provider scoping).
 * Returns: { valid, discount_type, discount_value, discount_amount, description, message }
 *
 * Core validation logic is shared with POST /api/public/promotions/validate
 * via the shared helper in @/lib/promotions/validate.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = (searchParams.get("code") || "").trim();
    const amount = parseFloat(searchParams.get("amount") || "0");

    if (!code) {
      return NextResponse.json({ valid: false, message: "Promo code is required" }, { status: 400 });
    }

    const supabase = await getSupabaseServer();

    const result = await validatePromoCode(supabase, { code, amount });

    if (!result.valid) {
      return NextResponse.json(
        { valid: false, message: result.message || "Invalid promo code" },
        { status: 200 }
      );
    }

    return NextResponse.json({
      valid: true,
      discount_type: result.promotion?.type,
      discount_value: result.promotion?.value ?? 0,
      discount_amount: result.discount.amount,
      description: result.promotion?.description ?? null,
    });
  } catch {
    return NextResponse.json({ valid: false, message: "Failed to validate promo code" }, { status: 500 });
  }
}

