import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { checkExploreEventsRateLimit } from "@/lib/rate-limit/explore-events";
import { createHash } from "crypto";

function getAnonHash(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : request.headers.get("x-real-ip") || "unknown";
  const ua = request.headers.get("user-agent") || "";
  const dayBucket = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}|${ua}|${dayBucket}`).digest("hex");
}

/**
 * POST /api/explore/events
 * Track view or like. Uses service role. Rate limited. Idempotent via actor_type+actor_key+idempotency_key.
 */
export async function POST(request: NextRequest) {
  try {
    const { allowed } = checkExploreEventsRateLimit(request);
    if (!allowed) {
      return errorResponse("Too many requests", "RATE_LIMITED", 429);
    }

    const body = await request.json();
    const { post_id, event_type, idempotency_key } = body;

    if (!post_id || !event_type || !idempotency_key) {
      return errorResponse(
        "post_id, event_type, and idempotency_key are required",
        "VALIDATION_ERROR",
        400
      );
    }

    if (event_type !== "view" && event_type !== "like") {
      return errorResponse("event_type must be view or like", "VALIDATION_ERROR", 400);
    }

    const supabase = await getSupabaseServer();
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: { user } } = await supabase.auth.getUser();

    let actorType: "authed" | "anon";
    let actorKey: string;

    if (user) {
      actorType = "authed";
      actorKey = user.id;
    } else {
      actorType = "anon";
      actorKey = getAnonHash(request);
    }

    const { error } = await supabaseAdmin.from("explore_events").insert({
      post_id,
      event_type,
      actor_type: actorType,
      actor_key: actorKey,
      idempotency_key,
    });

    if (error) {
      if (error.code === "23505") {
        return successResponse({ success: true }); // Duplicate = idempotent, treat as success
      }
      return handleApiError(error, "Failed to track event");
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to track event");
  }
}

/**
 * DELETE /api/explore/events?post_id=&event_type=like
 * Unlike - remove like event. Authed or anon.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const postId = searchParams.get("post_id");
    const eventType = searchParams.get("event_type");

    if (!postId || eventType !== "like") {
      return errorResponse(
        "post_id and event_type=like are required",
        "VALIDATION_ERROR",
        400
      );
    }

    const supabase = await getSupabaseServer();
    const supabaseAdmin = await getSupabaseAdmin();
    const { data: { user } } = await supabase.auth.getUser();

    let actorType: "authed" | "anon";
    let actorKey: string;

    if (user) {
      actorType = "authed";
      actorKey = user.id;
    } else {
      actorType = "anon";
      actorKey = getAnonHash(request);
    }

    const { error } = await supabaseAdmin
      .from("explore_events")
      .delete()
      .eq("post_id", postId)
      .eq("event_type", "like")
      .eq("actor_type", actorType)
      .eq("actor_key", actorKey);

    if (error) return handleApiError(error, "Failed to unlike");

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to unlike");
  }
}
