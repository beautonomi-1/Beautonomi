import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupportedMarketCountries } from "@/lib/tenant/market-availability";
import {
  SHOP_MARKET_COOKIE,
  shopMarketCookieMaxAgeSeconds,
} from "@/lib/tenant/shop-market";
import { checkPublicMutationRateLimit } from "@/lib/rate-limit/public-mutation";

const bodySchema = z.object({
  country_code: z.string().length(2),
});

/**
 * POST /api/public/market-opt-in
 * Records explicit Shop {market} consent via Set-Cookie (web clients).
 */
export async function POST(request: NextRequest) {
  const rateLimit = await checkPublicMutationRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } },
    );
  }

  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid country_code" }, { status: 400 });
    }
    const code = parsed.data.country_code.trim().toUpperCase();
    if (!getSupportedMarketCountries().has(code)) {
      return NextResponse.json({ error: "Market not available" }, { status: 400 });
    }

    const res = NextResponse.json({ data: { country_code: code }, error: null });
    res.cookies.set(SHOP_MARKET_COOKIE, code, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: shopMarketCookieMaxAgeSeconds(),
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Failed to record market opt-in" }, { status: 500 });
  }
}
