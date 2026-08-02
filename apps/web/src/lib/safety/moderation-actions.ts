import type { SupabaseClient } from "@supabase/supabase-js";

export type ContentReportTargetType =
  | "explore_post"
  | "explore_comment"
  | "message"
  | "review"
  | "product_review";

export type ModerationTakedownAction = "hide" | "delete";

export interface ModerationApplyResult {
  applied: boolean;
  action?: ModerationTakedownAction;
  message?: string;
}

export async function applyContentModerationTakedown(
  supabase: SupabaseClient,
  options: {
    targetType: ContentReportTargetType;
    targetId: string;
    adminUserId: string;
    action?: ModerationTakedownAction;
    notes?: string | null;
  },
): Promise<ModerationApplyResult> {
  const { targetType, targetId, adminUserId, notes } = options;
  const action = options.action ?? "hide";
  const now = new Date().toISOString();

  switch (targetType) {
    case "explore_post": {
      const { error } = await supabase
        .from("explore_posts")
        .update({
          is_hidden: true,
          moderated_at: now,
          moderated_by: adminUserId,
          moderation_notes: notes ?? "Hidden via content report resolution",
        })
        .eq("id", targetId);
      if (error) throw error;
      return { applied: true, action: "hide" };
    }
    case "explore_comment": {
      if (action === "delete") {
        const { error } = await supabase.from("explore_comments").delete().eq("id", targetId);
        if (error) throw error;
        return { applied: true, action: "delete" };
      }
      const { error } = await supabase
        .from("explore_comments")
        .update({
          is_hidden: true,
          hidden_at: now,
          hidden_by: adminUserId,
          moderation_notes: notes ?? "Hidden via content report resolution",
        })
        .eq("id", targetId);
      if (error) throw error;
      return { applied: true, action: "hide" };
    }
    case "message": {
      const { error } = await supabase
        .from("messages")
        .update({
          is_hidden: true,
          hidden_at: now,
          hidden_by: adminUserId,
          moderation_notes: notes ?? "Hidden via content report resolution",
        })
        .eq("id", targetId);
      if (error) throw error;
      return { applied: true, action: "hide" };
    }
    case "review": {
      const { error } = await supabase
        .from("reviews")
        .update({
          is_visible: false,
          is_flagged: true,
        })
        .eq("id", targetId);
      if (error) throw error;
      return { applied: true, action: "hide" };
    }
    case "product_review": {
      const { error } = await supabase
        .from("product_reviews")
        .update({
          is_visible: false,
          is_flagged: true,
        })
        .eq("id", targetId);
      if (error) throw error;
      return { applied: true, action: "hide" };
    }
    default:
      return { applied: false, message: `Unsupported target_type: ${targetType}` };
  }
}

/**
 * Auto-hide when pending report count for a target exceeds threshold within window.
 */
export async function maybeAutoHideReportedContent(
  supabase: SupabaseClient,
  options: {
    targetType: ContentReportTargetType;
    targetId: string;
    threshold: number;
    windowHours: number;
    systemUserId?: string | null;
  },
): Promise<ModerationApplyResult | null> {
  const since = new Date(Date.now() - options.windowHours * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("content_reports")
    .select("id", { count: "exact", head: true })
    .eq("target_type", options.targetType)
    .eq("target_id", options.targetId)
    .eq("status", "pending")
    .gte("created_at", since);

  if (error) throw error;
  if ((count ?? 0) < options.threshold) return null;

  const autoHideActorId =
    options.systemUserId ??
    "00000000-0000-0000-0000-000000000001";
  return applyContentModerationTakedown(supabase, {
    targetType: options.targetType,
    targetId: options.targetId,
    adminUserId: autoHideActorId,
    action: "hide",
    notes: `Auto-hidden after ${count} reports in ${options.windowHours}h (system)`,
  });
}
