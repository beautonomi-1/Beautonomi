import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

type CategoryRow = {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  audience: string;
  parent_id: string | null;
};

type TreeNode = CategoryRow & { children: TreeNode[] };

function buildTree(items: CategoryRow[], parentId: string | null = null): TreeNode[] {
  return items
    .filter((c) => (c.parent_id ?? null) === parentId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({ ...c, children: buildTree(items, c.id) }));
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const audience = searchParams.get("audience");
    let query = supabase
      .from("learning_categories")
      .select("id, title, slug, icon, sort_order, audience, parent_id")
      .eq("visibility", "public")
      .order("sort_order", { ascending: true });
    if (audience && ["general", "customer", "provider"].includes(audience)) {
      query = query.or("audience.eq." + audience + ",audience.eq.general");
    }
    const { data: rows, error } = await query;
    if (error) {
      console.error("Error fetching learn tree:", error);
      return NextResponse.json({ data: [], error: null });
    }
    const list = (rows ?? []) as CategoryRow[];
    const tree = buildTree(list);
    return NextResponse.json({ data: tree, error: null });
  } catch (err) {
    console.error("Unexpected error in GET /api/public/learn/tree:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to fetch tree", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
