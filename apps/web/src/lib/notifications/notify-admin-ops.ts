/**
 * Fan-out in-app notifications to admin staff by role.
 * Slack delivery stays in the existing slack/* triggers — call both at the event site.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/beautonomi";
import { insertNotifications } from "@/lib/notifications/insert-notification";

export type AdminOpsNotificationType = "admin_ops_alert" | "agent_proposal" | "support_queue";

const DEFAULT_RECIPIENT_CAP = 40;
const DEDUPE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

async function filterRecipientsByDedupeKey(
  userIds: string[],
  dedupeKey: string | undefined,
): Promise<string[]> {
  if (!dedupeKey || userIds.length === 0) return userIds;
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - DEDUPE_LOOKBACK_MS).toISOString();
  const { data, error } = await supabase
    .from("notifications")
    .select("user_id")
    .in("user_id", userIds)
    .gte("created_at", since)
    .filter("data->>dedupe_key", "eq", dedupeKey);
  if (error) {
    console.warn("[notifyAdminOps] dedupe lookup failed:", error.message);
    return userIds;
  }
  const seen = new Set((data ?? []).map((r: { user_id: string }) => r.user_id));
  return userIds.filter((id) => !seen.has(id));
}

export async function resolveAdminUserIdsByRoles(
  roles: UserRole[],
  limit = DEFAULT_RECIPIENT_CAP,
  tenantId?: string | null,
): Promise<string[]> {
  if (roles.length === 0) return [];
  const supabase = getSupabaseAdmin();
  if (tenantId) {
    const { data: members, error: memErr } = await supabase
      .from("user_tenant_roles")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .limit(limit * 3);
    if (!memErr && members?.length) {
      const memberIds = members.map((m) => m.user_id);
      const { data: usersInMarket } = await supabase
        .from("users")
        .select("id, role")
        .in("id", memberIds)
        .in("role", roles as string[]);
      const { data: supers } = await supabase.from("users").select("id").eq("role", "superadmin").limit(limit);
      return [...new Set([...(usersInMarket ?? []).map((u) => u.id), ...(supers ?? []).map((s) => s.id)])].slice(
        0,
        limit,
      );
    }
  }
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .in("role", roles as string[])
    .limit(limit);
  if (error) {
    console.warn("[notifyAdminOps] resolve recipients failed:", error.message);
    return [];
  }
  return [...new Set((data ?? []).map((r: { id: string }) => r.id).filter(Boolean))];
}

export async function notifyAdminOps(input: {
  roles: UserRole[];
  type: AdminOpsNotificationType;
  title: string;
  message: string;
  link: string;
  data?: Record<string, unknown>;
  recipientCap?: number;
  tenantId?: string | null;
  /** When set, skip users who received this key in the last 24 hours (read or unread). */
  dedupeKey?: string;
}): Promise<{ inserted: number; skipped: boolean }> {
  let userIds = await resolveAdminUserIdsByRoles(
    input.roles,
    input.recipientCap ?? DEFAULT_RECIPIENT_CAP,
    input.tenantId,
  );
  userIds = await filterRecipientsByDedupeKey(userIds, input.dedupeKey);
  if (userIds.length === 0) return { inserted: 0, skipped: true };

  const payloadData = {
    ...(input.data ?? {}),
    ...(input.dedupeKey ? { dedupe_key: input.dedupeKey } : {}),
  };

  try {
    await insertNotifications(
      userIds.map((user_id) => ({
        user_id,
        type: input.type,
        title: input.title,
        message: input.message,
        action_url: input.link,
        link: input.link,
        data: payloadData,
      })),
    );
  } catch (err) {
    console.warn("[notifyAdminOps] insert failed:", err instanceof Error ? err.message : err);
    return { inserted: 0, skipped: true };
  }

  return { inserted: userIds.length, skipped: false };
}
