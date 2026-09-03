import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireSuperadmin, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/workflow/runs
 * Durable Vercel Workflow registry (migration 865). Superadmin only.
 */
export async function GET(request: Request) {
  try {
    await requireSuperadmin(request);

    const { searchParams } = new URL(request.url);
    const workflow = searchParams.get("workflow");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const offset = (page - 1) * limit;

    const supabase = getSupabaseAdmin();
    let query = supabase.from("workflow_runs").select("*", { count: "exact" });

    if (workflow) query = query.eq("workflow", workflow);
    if (status) query = query.eq("status", status);

    const { data, error, count } = await query
      .order("started_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[admin/workflow/runs] fetch failed:", error);
      return NextResponse.json(
        { data: null, error: { message: "Failed to fetch workflow runs", code: "FETCH_ERROR" } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: data ?? [],
      error: null,
      meta: {
        page,
        limit,
        total: count ?? 0,
        has_more: (count ?? 0) > offset + limit,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch workflow runs");
  }
}
