/**
 * GET /api/public/learn/home
 * Learning Center landing config: hero, CTA cards, featured articles (resolved).
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await getSupabaseServer();

    const { data: sections } = await supabase
      .from("learning_homepage_sections")
      .select("section_key, payload")
      .in("section_key", ["hero", "cta_cards", "featured_articles", "video_library", "platform_updates"]);

    const out: Record<string, unknown> = {
      hero: { title: "Learning Center", subtitle: "Find guides and answers." },
      cta_cards: { cards: [] },
      featured_articles: [],
      video_library: { title: "Video Library", videos: [] },
      platform_updates: { title: "Platform Updates", article_ids: [] },
    };

    for (const s of sections ?? []) {
      const key = s.section_key as keyof typeof out;
      if (key in out && s.payload) out[key] = s.payload;
    }

    const featuredPayload = out.featured_articles;
    const featuredIds = Array.isArray(featuredPayload)
      ? []
      : ((featuredPayload as { article_ids?: string[] })?.article_ids ?? []);
    if (Array.isArray(featuredIds) && featuredIds.length > 0) {
      const { data: articles } = await supabase
        .from("learning_articles")
        .select("id, title, slug, summary, image_url, learning_categories(slug)")
        .in("id", featuredIds)
        .eq("status", "published")
        .eq("is_internal", false);
      out.featured_articles = articles ?? [];
    } else {
      out.featured_articles = [];
    }

    return NextResponse.json({ data: out, error: null });
  } catch (err) {
    console.error("Unexpected error in GET /api/public/learn/home:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to fetch homepage", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
