/**
 * GET /api/public/learn/home
 * Learning Center landing config: hero, CTA cards, featured articles (resolved).
 */
import { NextResponse } from "next/server";
import { getPublicLearnHome } from "@/lib/learn/public-queries";

export async function GET() {
  try {
    const out = await getPublicLearnHome();
    return NextResponse.json({ data: out, error: null });
  } catch (err) {
    console.error("Unexpected error in GET /api/public/learn/home:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to fetch homepage", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
