/**
 * GET /api/admin/content/learning/homepage
 * PATCH /api/admin/content/learning/homepage
 * Learning Center landing page config: hero, CTA cards, featured, video, platform updates.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { writeAuditLog } from "@/lib/audit/audit";
import { ADMIN_SECTION_CONTENT_CATALOG } from "@/lib/admin-sections";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const supabase = await getSupabaseServer(request);
    if (!supabase) {
      return NextResponse.json({
        data: {
          hero: { title: "", subtitle: "" },
          cta_cards: { cards: [] },
          featured_articles: { article_ids: [] },
          video_library: { title: "Video Library", videos: [] },
          platform_updates: { title: "Platform Updates", article_ids: [] },
        },
        error: null,
      });
    }

    const { data: sections } = await supabase
      .from("learning_homepage_sections")
      .select("section_key, payload")
      .in("section_key", ["hero", "cta_cards", "featured_articles", "video_library", "platform_updates"]);

    const out: Record<string, unknown> = {
      hero: { title: "", subtitle: "" },
      cta_cards: { cards: [] },
      featured_articles: { article_ids: [] },
      video_library: { title: "Video Library", videos: [] },
      platform_updates: { title: "Platform Updates", article_ids: [] },
    };

    for (const s of sections ?? []) {
      const key = s.section_key as keyof typeof out;
      if (key in out && s.payload) out[key] = s.payload;
    }

    return NextResponse.json({ data: out, error: null });
  } catch (err) {
    console.error("Unexpected error in GET learning homepage:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to fetch homepage config", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_CONTENT_CATALOG, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    if (typeof body !== "object" || body === null) {
      return NextResponse.json(
        { data: null, error: { message: "Body must be an object with section keys", code: "VALIDATION_ERROR" } },
        { status: 400 }
      );
    }

    const orderMap: Record<string, number> = {
      hero: 0,
      cta_cards: 1,
      featured_articles: 2,
      video_library: 3,
      platform_updates: 4,
    };

    const rows = Object.entries(body).map(([section_key, payload]) => ({
      section_key,
      payload: payload as Record<string, unknown>,
      display_order: orderMap[section_key] ?? 99,
    }));

    const { data: updated, error } = await supabase
      .from("learning_homepage_sections")
      .upsert(rows, { onConflict: "section_key" })
      .select();

    if (error) {
      console.error("Error updating learning homepage:", error);
      return NextResponse.json(
        { data: null, error: { message: "Failed to update homepage config", code: "UPDATE_ERROR" } },
        { status: 500 }
      );
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? "superadmin",
      action: "admin.content.learning.homepage.update",
      entity_type: "learning_homepage_sections",
      entity_id: "",
      metadata: { sections: Object.keys(body) },
    });

    return NextResponse.json({ data: body, error: null });
  } catch (err) {
    console.error("Unexpected error in PATCH learning homepage:", err);
    return NextResponse.json(
      { data: null, error: { message: "Failed to update homepage config", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
