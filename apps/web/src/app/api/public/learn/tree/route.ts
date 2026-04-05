import { NextRequest, NextResponse } from "next/server";
import { getPublicLearnTree } from "@/lib/learn/public-queries";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const audience = searchParams.get("audience");
    const aud =
      audience && ["general", "customer", "provider"].includes(audience) ? audience : null;
    const tree = await getPublicLearnTree(aud);
    return NextResponse.json({ data: tree, error: null });
  } catch (err) {
    console.error("Unexpected error in GET /api/public/learn/tree:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to fetch tree", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
