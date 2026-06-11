import { insertNotifications } from "@/lib/notifications/insert-notification";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Distinct app user IDs for a provider: owner (`providers.user_id`) plus active linked staff (`provider_staff.user_id`).
 * Used to fan out operational notifications (e.g. product orders, returns) beyond the owner only.
 */
export async function getProviderTeamUserIds(providerId: string): Promise<string[]> {
  const admin = getSupabaseAdmin();
  const { data: ownerRow } = await admin.from("providers").select("user_id").eq("id", providerId).maybeSingle();
  const { data: staffRows } = await admin
    .from("provider_staff")
    .select("user_id")
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .not("user_id", "is", null);

  const ids = new Set<string>();
  if (ownerRow?.user_id) ids.add(ownerRow.user_id as string);
  for (const s of staffRows ?? []) {
    const uid = (s as { user_id?: string | null }).user_id;
    if (uid) ids.add(uid);
  }
  return [...ids];
}

export type ProviderTeamNotificationRow = {
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  data?: Record<string, unknown>;
  link?: string | null;
  action_url?: string | null;
};

export type NotifyProviderTeamOptions = {
  /** When true, also send a push to each team member's provider app devices. */
  push?: boolean;
};

/** Insert the same in-app notification for each team member (service role; bypasses per-user RLS). */
export async function notifyProviderTeamUsers(
  providerId: string,
  payload: ProviderTeamNotificationRow,
  options?: NotifyProviderTeamOptions,
): Promise<void> {
  const userIds = await getProviderTeamUserIds(providerId);
  if (userIds.length === 0) return;

  await insertNotifications(
    userIds.map((user_id) => ({
      user_id,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      data: { ...(payload.data ?? {}), ...(payload.metadata ?? {}) },
      action_url: payload.action_url ?? payload.link ?? undefined,
    }))
  );

  if (options?.push) {
    try {
      const { sendToUsers } = await import("@/lib/notifications/onesignal");
      const actionUrl = payload.action_url ?? payload.link ?? undefined;
      await sendToUsers(
        userIds,
        {
          title: payload.title,
          message: payload.message,
          data: {
            type: payload.type,
            ...(payload.data ?? {}),
            ...(payload.metadata ?? {}),
          },
          ...(actionUrl ? { url: actionUrl } : {}),
        },
        ["push"],
        { appType: "provider" },
      );
    } catch (pushError) {
      console.warn("[notifyProviderTeamUsers] push failed:", pushError);
    }
  }
}
