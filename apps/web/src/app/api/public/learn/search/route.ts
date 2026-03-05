/**
 * GET /api/public/learn/search?q=...&page=&limit=
 * Full-text search over Learning Center articles. Optional topic (category) match.
 * Results include result_type (article | video_guide | topic), read_time_min, and breadcrumb for scannable UI.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

type BodyMap = Record<string, string>;

function wordCount(text: string | null): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function readTimeMin(bodyWordCount: number): number {
  return Math.max(1, Math.ceil(bodyWordCount / 200));
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    if (!q) {
      return NextResponse.json({
        data: {
          results: [],
          by_type: { articles: [], topics: [], video_guides: [] },
          total: 0,
          page,
          limit,
        },
        error: null,
      });
    }

    const { data: articleRows, error } = await supabase.rpc("search_learning_articles", {
      p_query: q,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      console.error("Error searching learning articles:", error);
      return NextResponse.json({
        data: { results: [], by_type: { articles: [], topics: [], video_guides: [] }, total: 0, page, limit },
        error: null,
      });
    }

    const rows = articleRows ?? [];
    const articleIds = rows.map((r: { id: string }) => r.id);
    let bodyMap: BodyMap = {};
    if (articleIds.length > 0) {
      const { data: bodies } = await supabase
        .from("learning_articles")
        .select("id, body")
        .in("id", articleIds);
      bodyMap = (bodies ?? []).reduce<BodyMap>((acc, row: { id: string; body: string | null }) => {
        acc[row.id] = row.body ?? "";
        return acc;
      }, {});
    }

    const results = rows.map((r: { id: string; title: string; slug: string; summary: string | null; published_at: string | null; rank: number; content_type?: string }) => {
      const ct = r.content_type === "video_guide" ? "video_guide" : "article";
      const words = wordCount(bodyMap[r.id]);
      return {
        ...r,
        result_type: ct,
        read_time_min: readTimeMin(words),
      };
    });

    const articles = results.filter((r: { result_type: string }) => r.result_type === "article");
    const video_guides = results.filter((r: { result_type: string }) => r.result_type === "video_guide");
    const topics: unknown[] = [];
    const safeQ = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const { data: topicRows } = await supabase
      .from("learning_categories")
      .select("id, title, slug, audience")
      .eq("visibility", "public")
      .or(`title.ilike.%${safeQ}%,slug.ilike.%${safeQ}%`)
      .limit(10);
    if (topicRows?.length) {
      topicRows.forEach((t: { id: string; title: string; slug: string; audience: string }) =>
        topics.push({ id: t.id, title: t.title, slug: t.slug, result_type: "topic", audience: t.audience })
      );
    }

    const payload = {
      data: {
        results,
        by_type: { articles, topics, video_guides },
        total: results.length,
        page,
        limit,
      },
      error: null,
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("Unexpected error in GET /api/public/learn/search:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to search", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
