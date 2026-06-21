import { cache } from "react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface LearnArticleData {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  body: string;
  content_format: string;
  published_at: string | null;
  image_url?: string | null;
  /** YouTube/Vimeo URL, or direct .mp4/.webm/.gif — see LearnArticleHero */
  hero_video_url?: string | null;
  learning_categories?: { id: string; title: string; slug: string };
  parents: string[];
  parent_slugs: string[];
  stats: { view_count: number; helpful_yes_count: number; helpful_no_count: number };
  related_articles: { id: string; title: string; slug: string; summary: string | null }[];
  category_nav: { prev: { title: string; slug: string } | null; next: { title: string; slug: string } | null };
}

async function getCategoryLineage(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  categoryId: string,
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
    currentId = (cat as any).parent_id ?? null;
  }
  return lineage;
}

/**
 * Server-side loader for /learn/article/[slug].
 * Increments view count via admin client and returns article + metadata.
 * Wrapped in React.cache for dedup between generateMetadata and page body.
 */
export const getLearnArticle = cache(async (slug: string): Promise<LearnArticleData | null> => {
  try {
    const supabase = await getSupabaseServer();

    const { data: article, error } = await supabase
      .from("learning_articles")
      .select(
        "id, category_id, title, slug, summary, body, content_format, published_at, image_url, hero_video_url, content_type, learning_categories(id, title, slug)",
      )
      .eq("slug", slug)
      .eq("status", "published")
      .eq("is_internal", false)
      .single();

    if (error || !article) return null;

    const parentsLineage = await getCategoryLineage(supabase, (article as any).category_id);

    // Increment view count (non-fatal)
    try {
      const admin = getSupabaseAdmin();
      const { data: existing } = await admin
        .from("learning_article_stats")
        .select("view_count, helpful_yes_count, helpful_no_count")
        .eq("article_id", article.id)
        .single();
      const view_count = (existing?.view_count ?? 0) + 1;
      await admin.from("learning_article_stats").upsert(
        {
          article_id: article.id,
          view_count,
          helpful_yes_count: existing?.helpful_yes_count ?? 0,
          helpful_no_count: existing?.helpful_no_count ?? 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "article_id" },
      );
    } catch {
      // non-fatal
    }

    const { data: stat } = await supabase
      .from("learning_article_stats")
      .select("view_count, helpful_yes_count, helpful_no_count")
      .eq("article_id", article.id)
      .single();

    const { data: relatedRows } = await supabase
      .from("learning_articles")
      .select("id, title, slug, summary")
      .eq("category_id", (article as any).category_id)
      .eq("status", "published")
      .eq("is_internal", false)
      .neq("id", article.id)
      .order("updated_at", { ascending: false })
      .limit(3);

    const { data: categorySiblings } = await supabase
      .from("learning_articles")
      .select("id, title, slug")
      .eq("category_id", (article as any).category_id)
      .eq("status", "published")
      .eq("is_internal", false)
      .order("title", { ascending: true });

    const siblings = categorySiblings ?? [];
    const currentIdx = siblings.findIndex((s) => s.id === article.id);
    const prevSibling = currentIdx > 0 ? siblings[currentIdx - 1] : null;
    const nextSibling = currentIdx >= 0 && currentIdx < siblings.length - 1 ? siblings[currentIdx + 1] : null;

    return {
      ...(article as any),
      parents: parentsLineage.map((p) => p.title),
      parent_slugs: parentsLineage.map((p) => p.slug),
      stats: stat ?? { view_count: 0, helpful_yes_count: 0, helpful_no_count: 0 },
      related_articles: relatedRows ?? [],
      category_nav: {
        prev: prevSibling ? { title: prevSibling.title, slug: prevSibling.slug } : null,
        next: nextSibling ? { title: nextSibling.title, slug: nextSibling.slug } : null,
      },
    };
  } catch (error) {
    console.error("getLearnArticle error:", error);
    return null;
  }
});
