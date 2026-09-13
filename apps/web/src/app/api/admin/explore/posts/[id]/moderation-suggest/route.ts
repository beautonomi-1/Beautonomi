import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { callLlm } from "@/lib/ai/call-llm";

/**
 * POST /api/admin/explore/posts/[id]/moderation-suggest
 * Suggest-only moderation reason — never writes is_hidden.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const { data: post } = await supabase
      .from("explore_posts")
      .select("id, caption, media_urls, status, is_hidden")
      .eq("id", id)
      .maybeSingle();
    if (!post) return errorResponse("Post not found", "NOT_FOUND", 404);

    const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production";
    const environment = env === "production" ? "production" : env === "staging" ? "staging" : "development";

    const result = await callLlm({
      system:
        'Suggest a moderation review reason for an admin. JSON only: { "suggested_reason": string, "confidence": "low"|"medium"|"high", "notes": string }. Advisory only.',
      user: `Caption: ${(post as { caption?: string }).caption ?? ""}\nHidden: ${(post as { is_hidden?: boolean }).is_hidden}`,
      schema: {
        type: "object",
        properties: {
          suggested_reason: { type: "string" },
          confidence: { type: "string" },
          notes: { type: "string" },
        },
        required: ["suggested_reason", "confidence"],
      },
      maxTokens: 300,
      featureKey: "admin.explore.moderation_suggest",
      environment,
    });

    if (!result.success) {
      return errorResponse(result.errorCode ?? "AI unavailable", "AI_ERROR", 502);
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(result.text) as Record<string, unknown>;
    } catch {
      parsed = { suggested_reason: result.text, confidence: "low", notes: "" };
    }

    return successResponse({
      ...parsed,
      advisory_only: true,
      post_id: id,
    });
  } catch (error) {
    return handleApiError(error as Error, "Moderation suggest failed");
  }
}
