/**
 * GET /api/public/learn/categories
 * List Learning Center categories (public only). Optional ?audience= filter.
 */
import { NextRequest, NextResponse } from "next/server";
import { getPublicLearnCategoriesFlat } from "@/lib/learn/public-queries";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const audience = searchParams.get("audience");
    const aud =
      audience && ["general", "customer", "provider"].includes(audience) ? audience : null;
    const data = await getPublicLearnCategoriesFlat(aud);
    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error("Unexpected error in GET /api/public/learn/categories:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to fetch categories", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
