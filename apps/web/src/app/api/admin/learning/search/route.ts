/**
 * GET /api/admin/learning/search
 * Internal knowledge-base search for the admin/support team.
 * Includes internal articles and is audience-aware. Used by the support ticket
 * desk (insert article links) and the admin Knowledge Base reader.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, handleApiError, getOffsetPaginationParams } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || null;
    const audience = searchParams.get("audience")?.trim() || null;
    const includeInternalParam = searchParams.get("include_internal");
    const includeInternal = includeInternalParam == null ? true : includeInternalParam !== "false";
    const { limit, offset } = getOffsetPaginationParams(request, { defaultLimit: 20, maxLimit: 50 });

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("search_learning_articles_admin", {
      p_query: q,
      p_limit: limit,
      p_offset: offset,
      p_audience: audience && ["customer", "provider", "general", "internal"].includes(audience) ? audience : null,
      p_include_internal: includeInternal,
    });

    if (error) {
      console.error("Error searching learning articles (admin):", error);
      return NextResponse.json({ data: [], error: null });
    }

    return NextResponse.json({ data: data ?? [], error: null });
  } catch (err) {
    return handleApiError(err, "Failed to search learning articles");
  }
}
