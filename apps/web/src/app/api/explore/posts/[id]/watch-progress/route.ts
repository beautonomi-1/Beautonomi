import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { checkExploreEventsRateLimit } from "@/lib/rate-limit/explore-events";
import { isExploreEnabled } from "@/lib/explore/explore-feature-gates";

function getAnonHash(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip") || "unknown";
  const ua = request.headers.get("user-agent") || "";
  const dayBucket = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}|${ua}|${dayBucket}`).digest("hex");
}

/**
 * POST /api/explore/posts/[id]/watch-progress
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await isExploreEnabled(null))) {
      return errorResponse("Not found", "NOT_FOUND", 404);
    }
    const { allowed } = await checkExploreEventsRateLimit(request);
    if (!allowed) {
      return errorResponse("Too many requests", "RATE_LIMITED", 429);
    }

    const { id: postId } = await params;
    const body = await request.json().catch(() => ({}));
    const watchedMs = Number(body.watched_ms);
    if (!Number.isFinite(watchedMs) || watchedMs < 0) {
      return errorResponse("watched_ms is required", "VALIDATION_ERROR", 400);
    }

    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = await getSupabaseAdmin();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const actorType = user ? "authed" : "anon";
    const actorKey = user ? user.id : getAnonHash(request);

    const { data: post } = await supabaseAdmin
      .from("explore_posts")
      .select("duration_ms, status")
      .eq("id", postId)
      .eq("status", "published")
      .maybeSingle();

    if (!post) return errorResponse("Post not found", "NOT_FOUND", 404);

    const durationMs = post.duration_ms ?? 0;
    const completed = durationMs > 0 && watchedMs >= durationMs * 0.75;

    const { data: existing } = await supabaseAdmin
      .from("explore_watch_progress")
      .select("watched_ms, completed")
      .eq("post_id", postId)
      .eq("actor_type", actorType)
      .eq("actor_key", actorKey)
      .maybeSingle();

    const nextWatched = Math.max(existing?.watched_ms ?? 0, Math.floor(watchedMs));
    const nextCompleted = (existing?.completed ?? false) || completed;

    const { error } = await supabaseAdmin.from("explore_watch_progress").upsert(
      {
        post_id: postId,
        actor_type: actorType,
        actor_key: actorKey,
        watched_ms: nextWatched,
        completed: nextCompleted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "actor_type,actor_key,post_id" },
    );

    if (error) return handleApiError(error, "Failed to save watch progress");
    return successResponse({ watched_ms: nextWatched, completed: nextCompleted });
  } catch (error) {
    return handleApiError(error, "Failed to save watch progress");
  }
}
