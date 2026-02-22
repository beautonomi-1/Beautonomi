import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  handleApiError,
  requireAuthInApi,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import type { ExploreComment } from "@/types/explore";

/** Returns true if the post is publicly visible (published + not hidden). */
function isPostPublic(post: { status: string; is_hidden: boolean }) {
  return post.status === "published" && post.is_hidden === false;
}

/** Check if the authenticated user can access this post as provider (owner or staff). */
async function userCanAccessPostAsProvider(userId: string, postProviderId: string): Promise<boolean> {
  const providerId = await getProviderIdForUser(userId);
  return providerId === postProviderId;
}

/**
 * GET /api/explore/posts/[id]/comments
 * Public: list comments for a published post.
 * Provider: list comments for own post (any status, e.g. draft).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10), 1), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);

    const supabaseAdmin = await getSupabaseAdmin();

    const { data: post, error: postError } = await supabaseAdmin
      .from("explore_posts")
      .select("id, provider_id, status, is_hidden")
      .eq("id", postId)
      .single();

    if (postError || !post) {
      return errorResponse("Post not found", "NOT_FOUND", 404);
    }

    let canAccess = isPostPublic(post);
    if (!canAccess) {
      const supabase = await getSupabaseServer();
      const { data: { user } } = await supabase.auth.getUser();
      canAccess = !!(user && (await userCanAccessPostAsProvider(user.id, post.provider_id)));
    }
    if (!canAccess) {
      return errorResponse("Post not found", "NOT_FOUND", 404);
    }

    const { data: rows, error } = await supabaseAdmin
      .from("explore_comments")
      .select(
        `
        id,
        post_id,
        user_id,
        body,
        mentioned_user_ids,
        created_at,
        updated_at,
        users:user_id(id, full_name, avatar_url)
      `
      )
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) return handleApiError(error, "Failed to fetch comments");

    const comments: ExploreComment[] = (rows || []).map((r: any) => ({
      id: r.id,
      post_id: r.post_id,
      user_id: r.user_id,
      author: r.users
        ? {
            id: r.users.id,
            full_name: r.users.full_name ?? null,
            avatar_url: r.users.avatar_url ?? null,
          }
        : { id: r.user_id, full_name: null, avatar_url: null },
      body: r.body,
      mentioned_user_ids: r.mentioned_user_ids ?? [],
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    const next_offset = comments.length === limit ? offset + limit : undefined;

    return successResponse({
      data: comments,
      next_offset: next_offset ?? undefined,
      has_more: !!next_offset,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch comments");
  }
}

/**
 * POST /api/explore/posts/[id]/comments
 * Authenticated: create a comment on a published post.
 * Body: { body: string, mention_user_ids?: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuthInApi(request);
    const { id: postId } = await params;

    const body = await request.json();
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text) {
      return errorResponse("Comment body is required", "VALIDATION_ERROR", 400);
    }
    const MAX_BODY_LENGTH = 200;
    if (text.length > MAX_BODY_LENGTH) {
      return errorResponse(
        `Comment must be ${MAX_BODY_LENGTH} characters or fewer`,
        "VALIDATION_ERROR",
        400
      );
    }

    const mentionUserIds: string[] = Array.isArray(body.mention_user_ids)
      ? body.mention_user_ids.filter((id: unknown) => typeof id === "string")
      : [];

    const supabaseAdmin = await getSupabaseAdmin();

    const { data: post, error: postError } = await supabaseAdmin
      .from("explore_posts")
      .select("id, provider_id, status, is_hidden")
      .eq("id", postId)
      .single();

    if (postError || !post) {
      return errorResponse("Post not found", "NOT_FOUND", 404);
    }

    const canComment =
      isPostPublic(post) || (await userCanAccessPostAsProvider(user.id, post.provider_id));
    if (!canComment) {
      return errorResponse("Post not found", "NOT_FOUND", 404);
    }

    const { data: row, error } = await supabaseAdmin
      .from("explore_comments")
      .insert({
        post_id: postId,
        user_id: user.id,
        body: text,
        mentioned_user_ids: mentionUserIds,
      })
      .select(
        `
        id,
        post_id,
        user_id,
        body,
        mentioned_user_ids,
        created_at,
        updated_at,
        users:user_id(id, full_name, avatar_url)
      `
      )
      .single();

    if (error) return handleApiError(error, "Failed to create comment");

    const comment: ExploreComment = {
      id: row.id,
      post_id: row.post_id,
      user_id: row.user_id,
      author: row.users
        ? (() => {
            const u = Array.isArray(row.users) ? (row.users as any)[0] : (row.users as any);
            return {
              id: u?.id ?? row.user_id,
              full_name: u?.full_name ?? null,
              avatar_url: u?.avatar_url ?? null,
            };
          })()
        : { id: row.user_id, full_name: null, avatar_url: null },
      body: row.body,
      mentioned_user_ids: row.mentioned_user_ids ?? [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    return successResponse(comment, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create comment");
  }
}
