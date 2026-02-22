import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";

/**
 * GET /api/explore/debug
 * Returns raw counts from explore_posts for troubleshooting.
 * Protected: superadmin only.
 */
export async function GET() {
  try {
    // Only superadmins can access debug endpoints
    await requireRoleInApi(["superadmin"]);

    const supabase = await getSupabaseAdmin();
    const [
      { count: total },
      { count: published },
      { count: publishedNotHidden },
    ] = await Promise.all([
      supabase.from("explore_posts").select("id", { count: "exact", head: true }),
      supabase
        .from("explore_posts")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
      supabase
        .from("explore_posts")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .eq("is_hidden", false),
    ]);
    const { data: sample } = await supabase
      .from("explore_posts")
      .select("id, status, is_hidden")
      .limit(5);
    return NextResponse.json({
      total: total ?? null,
      published: published ?? null,
      publishedNotHidden: publishedNotHidden ?? null,
      sample: sample ?? [],
    });
  } catch (e) {
    // Return proper 401/403 for auth errors, 500 for everything else
    if (e instanceof Error && (
      e.message.includes("Authentication required") ||
      e.message.includes("Insufficient permissions")
    )) {
      return NextResponse.json(
        { error: e.message },
        { status: e.message.includes("Authentication") ? 401 : 403 }
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
