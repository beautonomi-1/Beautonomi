/**
 * GET /api/public/learn/topics/[slug]
 * Category by slug + paginated articles (published, non-internal). Returns parents (breadcrumb lineage).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

async function getCategoryLineage(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  categoryId: string
): Promise<{ title: string; slug: string }[]> {
  const lineage: { title: string; slug: string }[] = [];
  let currentId: string | null = categoryId;
  const seen = new Set<string>();
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const { data: cat } = await supabase
      .from("learning_categories")
      .select("id, title, slug, parent_id")
      .eq("id", currentId)
      .single();
    if (!cat) break;
    lineage.unshift({ title: cat.title, slug: cat.slug });
    currentId = cat.parent_id ?? null;
  }
  return lineage;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    const { data: category, error: catError } = await supabase
      .from("learning_categories")
      .select("id, title, slug, icon, sort_order, audience, parent_id")
      .eq("slug", slug)
      .eq("visibility", "public")
      .single();

    if (catError || !category) {
      return NextResponse.json(
        { data: null, error: { message: "Topic not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    const parentsLineage = await getCategoryLineage(supabase, category.id);
    const parents = parentsLineage.map((p) => p.title);
    const parent_slugs = parentsLineage.map((p) => p.slug);

    const { data: articles, error: artError, count } = await supabase
      .from("learning_articles")
      .select("id, title, slug, summary, image_url, published_at", { count: "exact" })
      .eq("category_id", category.id)
      .eq("status", "published")
      .eq("is_internal", false)
      .or("published_at.is.null,published_at.lte." + new Date().toISOString())
      .order("published_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (artError) {
      console.error("Error fetching topic articles:", artError);
      return NextResponse.json({ data: { category, articles: [], total: 0, page, limit }, error: null });
    }

    return NextResponse.json({
      data: {
        category,
        parents,
        parent_slugs,
        articles: articles ?? [],
        total: count ?? 0,
        page,
        limit,
      },
      error: null,
    });
  } catch (err) {
    console.error("Unexpected error in GET /api/public/learn/topics/[slug]:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to fetch topic", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
