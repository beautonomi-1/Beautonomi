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

export interface SuspendUserResult {
  suspended: boolean;
  message?: string;
}

/** Resolve the user_id of the author for a reported content target. */
export async function resolveContentAuthorUserId(
  supabase: SupabaseClient,
  targetType: ContentReportTargetType,
  targetId: string,
): Promise<string | null> {
  switch (targetType) {
    case "explore_post": {
      const { data } = await supabase
        .from("explore_posts")
        .select("created_by_user_id")
        .eq("id", targetId)
        .maybeSingle();
      return (data as { created_by_user_id?: string | null } | null)?.created_by_user_id ?? null;
    }
    case "explore_comment": {
      const { data } = await supabase
        .from("explore_comments")
        .select("user_id")
        .eq("id", targetId)
        .maybeSingle();
      return (data as { user_id?: string | null } | null)?.user_id ?? null;
    }
    case "message": {
      const { data } = await supabase
        .from("messages")
        .select("sender_id")
        .eq("id", targetId)
        .maybeSingle();
      return (data as { sender_id?: string | null } | null)?.sender_id ?? null;
    }
    case "review": {
      const { data } = await supabase
        .from("reviews")
        .select("customer_id")
        .eq("id", targetId)
        .maybeSingle();
      return (data as { customer_id?: string | null } | null)?.customer_id ?? null;
    }
    case "product_review": {
      const { data } = await supabase
        .from("product_reviews")
        .select("customer_id")
        .eq("id", targetId)
        .maybeSingle();
      return (data as { customer_id?: string | null } | null)?.customer_id ?? null;
    }
    default:
      return null;
  }
}

/** Suspend a platform user account (auth ban + users.deactivated_at). */
export async function suspendUserAsAdmin(
  supabase: SupabaseClient,
  options: {
    userId: string;
    adminUserId: string;
    reason?: string | null;
  },
): Promise<SuspendUserResult> {
  const { userId, adminUserId, reason } = options;
  if (userId === adminUserId) {
    return { suspended: false, message: "Cannot suspend your own account" };
  }

  const { data: target, error: fetchError } = await supabase
    .from("users")
    .select("id, role, deactivated_at")
    .eq("id", userId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!target) return { suspended: false, message: "User not found" };
  if ((target as { role?: string }).role === "superadmin") {
    return { suspended: false, message: "Cannot suspend a superadmin account" };
  }
  if ((target as { deactivated_at?: string | null }).deactivated_at) {
    return { suspended: true, message: "User is already suspended" };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("users")
    .update({
      deactivated_at: now,
      deactivated_by: "admin",
      is_active: false,
      deactivation_reason: reason?.trim() || "Suspended via trust & safety moderation",
    })
    .eq("id", userId);

  if (updateError) throw updateError;

  await supabase.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
  });

  return { suspended: true };
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
