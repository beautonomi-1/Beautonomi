import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { dispatchTemplateNotification } from "@/lib/notifications/dispatch-template-notification";
import type { NotificationChannel } from "@/lib/notifications/onesignal";

/**
 * Notify subject user when Trust holds or releases a fraud case (human action only).
 * Copy avoids the word "fraud".
 */
export async function notifyFraudCaseReviewStatus(params: {
  subjectUserId: string | null | undefined;
  subjectProviderId: string | null | undefined;
  status: "held" | "released" | "closed";
  previousStatus: string;
}): Promise<void> {
  const userIds = await resolveNotifyUserIds(params.subjectUserId, params.subjectProviderId);
  if (userIds.length === 0) return;

  // In-app rows are created by dispatchTemplateNotification by default
  // (see skipInApp option) — "in_app" is not a NotificationChannel value.
  const channels: NotificationChannel[] = ["email", "push"];

  if (params.status === "held") {
    await dispatchTemplateNotification(
      "account_under_review",
      userIds,
      { user_name: "there" },
      channels,
      { appType: "customer" },
    );
    return;
  }

  if (
    (params.status === "released" || params.status === "closed") &&
    params.previousStatus === "held"
  ) {
    await dispatchTemplateNotification(
      "account_review_cleared",
      userIds,
      { user_name: "there" },
      channels,
      { appType: "customer" },
    );
  }
}

async function resolveNotifyUserIds(
  subjectUserId: string | null | undefined,
  subjectProviderId: string | null | undefined,
): Promise<string[]> {
  const ids = new Set<string>();
  if (subjectUserId) ids.add(subjectUserId);

  if (subjectProviderId) {
    const supabase = getSupabaseAdmin();
    const { data: provider } = await supabase
      .from("providers")
      .select("user_id")
      .eq("id", subjectProviderId)
      .maybeSingle();
    const ownerId = (provider as { user_id?: string | null } | null)?.user_id;
    if (ownerId) ids.add(ownerId);
  }

  return [...ids];
}
