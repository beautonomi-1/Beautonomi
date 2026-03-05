/**
 * POST /api/public/learn/article/[slug]/feedback
 * "Was this helpful?" — increment helpful_yes_count or helpful_no_count.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await getSupabaseServer();

    const { data: article, error: artError } = await supabase
      .from("learning_articles")
      .select("id")
      .eq("slug", slug)
      .eq("status", "published")
      .eq("is_internal", false)
      .single();

    if (artError || !article) {
      return NextResponse.json(
        { data: null, error: { message: "Article not found", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const helpful = body?.helpful === true ? true : body?.helpful === false ? false : null;
    if (helpful === null) {
      return NextResponse.json(
        { data: null, error: { message: "Missing or invalid helpful (boolean)", code: "VALIDATION_ERROR" } },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const { data: existing } = await admin.from("learning_article_stats").select("helpful_yes_count, helpful_no_count, view_count").eq("article_id", article.id).single();

    const helpful_yes_count = (existing?.helpful_yes_count ?? 0) + (helpful ? 1 : 0);
    const helpful_no_count = (existing?.helpful_no_count ?? 0) + (helpful ? 0 : 1);

    await admin
      .from("learning_article_stats")
      .upsert(
        {
          article_id: article.id,
          view_count: existing?.view_count ?? 0,
          helpful_yes_count,
          helpful_no_count,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "article_id" }
      );

    await admin.from("learning_article_feedback").insert({
      article_id: article.id,
      helpful,
      session_id: request.headers.get("x-session-id") ?? null,
    });

    return NextResponse.json({ data: { ok: true }, error: null });
  } catch (err) {
    console.error("Unexpected error in POST learn article feedback:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to submit feedback", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
