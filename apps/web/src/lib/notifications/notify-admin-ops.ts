/**
 * Fan-out in-app notifications to admin staff by role.
 * Slack delivery stays in the existing slack/* triggers — call both at the event site.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/beautonomi";
import { insertNotifications } from "@/lib/notifications/insert-notification";

export type AdminOpsNotificationType = "admin_ops_alert" | "agent_proposal" | "support_queue";

const DEFAULT_RECIPIENT_CAP = 40;

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
}): Promise<{ inserted: number; skipped: boolean }> {
  const userIds = await resolveAdminUserIdsByRoles(
    input.roles,
    input.recipientCap ?? DEFAULT_RECIPIENT_CAP,
    input.tenantId,
  );
  if (userIds.length === 0) return { inserted: 0, skipped: true };

  try {
    await insertNotifications(
      userIds.map((user_id) => ({
        user_id,
        type: input.type,
        title: input.title,
        message: input.message,
        action_url: input.link,
        link: input.link,
        data: input.data ?? {},
      })),
    );
  } catch (err) {
    console.warn("[notifyAdminOps] insert failed:", err instanceof Error ? err.message : err);
    return { inserted: 0, skipped: true };
  }

  return { inserted: userIds.length, skipped: false };
}
