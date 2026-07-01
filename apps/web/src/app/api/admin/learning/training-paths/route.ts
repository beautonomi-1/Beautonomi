/**
 * GET /api/admin/learning/training-paths
 * Returns all training paths with each article_slugs entry resolved to article
 * metadata, preserving order. Any admin role (ADMIN_SECTION_OVERVIEW).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, handleApiError } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";

type PathRow = {
  id: string;
  slug: string;
  title: string;
  role: string;
  description: string | null;
  sort_order: number;
  article_slugs: string[];
  created_at: string;
  updated_at: string;
};

type ArticleStub = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  audience: string;
  is_internal: boolean;
  status: string;
  content_type: string | null;
};

export type TrainingPathStep = ArticleStub & { step: number };

export type TrainingPathResponse = Omit<PathRow, "article_slugs"> & {
  steps: TrainingPathStep[];
};

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const admin = getSupabaseAdmin();

    const { data: paths, error: pathsError } = await admin
      .from("learning_training_paths")
      .select("id, slug, title, role, description, sort_order, article_slugs, created_at, updated_at")
      .order("sort_order", { ascending: true });

    if (pathsError) {
      console.error("Error loading training paths:", pathsError);
      return NextResponse.json({ data: [], error: null });
    }

    const rows = (paths ?? []) as PathRow[];

    // Collect every unique article slug across all paths
    const allSlugs = Array.from(new Set(rows.flatMap((p) => p.article_slugs)));

    const articleMap = new Map<string, ArticleStub>();

    if (allSlugs.length > 0) {
      const { data: articles } = await admin
        .from("learning_articles")
        .select("id, slug, title, summary, audience, is_internal, status, content_type")
        .in("slug", allSlugs)
        .eq("status", "published");

      for (const a of articles ?? []) {
        articleMap.set(a.slug, a as ArticleStub);
      }
    }

    const resolved: TrainingPathResponse[] = rows.map((path) => {
      const steps: TrainingPathStep[] = [];
      path.article_slugs.forEach((slug, idx) => {
        const article = articleMap.get(slug);
        if (article) {
          steps.push({ ...article, step: idx + 1 });
        }
      });
      const { article_slugs: _dropped, ...rest } = path;
      return { ...rest, steps };
    });

    return NextResponse.json({ data: resolved, error: null });
  } catch (err) {
    return handleApiError(err, "Failed to load training paths");
  }
}
