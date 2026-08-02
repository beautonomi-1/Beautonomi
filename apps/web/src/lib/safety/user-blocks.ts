import type { SupabaseClient } from "@supabase/supabase-js";

export class UserBlockedError extends Error {
  status = 403;
  code = "USER_BLOCKED";

  constructor(message = "You cannot interact with this user.") {
    super(message);
    this.name = "UserBlockedError";
  }
}

/**
 * Returns user IDs where either party has blocked the other (bidirectional).
 */
export async function getBlockedUserIds(
  userId: string,
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const [{ data: blockedByMe }, { data: blockedMe }] = await Promise.all([
    supabase.from("user_blocks").select("blocked_user_id").eq("blocker_id", userId),
    supabase.from("user_blocks").select("blocker_id").eq("blocked_user_id", userId),
  ]);

  const ids = new Set<string>();
  for (const row of blockedByMe ?? []) {
    const id = (row as { blocked_user_id?: string }).blocked_user_id;
    if (id) ids.add(id);
  }
  for (const row of blockedMe ?? []) {
    const id = (row as { blocker_id?: string }).blocker_id;
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * User IDs the viewer has muted (one direction only).
 */
export async function getMutedUserIds(
  userId: string,
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("user_mutes")
    .select("muted_user_id")
    .eq("muter_id", userId);

  const ids = new Set<string>();
  for (const row of data ?? []) {
    const id = (row as { muted_user_id?: string }).muted_user_id;
    if (id) ids.add(id);
  }
  return ids;
}

export async function assertNotBlocked(
  actorId: string,
  otherUserId: string,
  supabase: SupabaseClient,
): Promise<void> {
  if (!otherUserId || actorId === otherUserId) return;

  const { data, error } = await supabase
    .from("user_blocks")
    .select("id")
    .or(
      `and(blocker_id.eq.${actorId},blocked_user_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_user_id.eq.${actorId})`,
    )
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (data) {
    throw Object.assign(new UserBlockedError(), { status: 403, code: "USER_BLOCKED" });
  }
}

export function filterBlockedAuthors<T extends { user_id?: string | null }>(
  items: T[],
  blockedIds: Set<string>,
): T[] {
  if (blockedIds.size === 0) return items;
  return items.filter((item) => {
    const authorId = item.user_id;
    return !authorId || !blockedIds.has(authorId);
  });
}

export function filterBlockedUserIds<T extends { id?: string | null }>(
  items: T[],
  blockedIds: Set<string>,
): T[] {
  if (blockedIds.size === 0) return items;
  return items.filter((item) => {
    const id = item.id;
    return !id || !blockedIds.has(id);
  });
}

/**
 * Drop notification recipients blocked by or blocking the sender (bidirectional).
 */
export async function filterBlockedNotificationRecipients(
  senderUserId: string,
  recipientUserIds: string[],
  supabase: SupabaseClient,
): Promise<string[]> {
  const unique = [...new Set(recipientUserIds.filter((id) => id && id !== senderUserId))];
  if (unique.length === 0) return [];
  const blocked = await getBlockedUserIds(senderUserId, supabase);
  if (blocked.size === 0) return unique;
  return unique.filter((id) => !blocked.has(id));
}

/**
 * Resolve the peer user_id for a customer↔provider conversation from the caller's perspective.
 */
export async function getConversationPeerUserId(
  conv: { customer_id?: string | null; provider_id?: string | null },
  actorUserId: string,
  actorRole: "customer" | "provider",
  supabase: SupabaseClient,
): Promise<string | null> {
  if (actorRole === "customer") {
    if (!conv.provider_id) return null;
    const { data: providerRow } = await supabase
      .from("providers")
      .select("user_id")
      .eq("id", conv.provider_id)
      .maybeSingle();
    return (providerRow as { user_id?: string | null } | null)?.user_id ?? null;
  }
  return conv.customer_id ?? null;
}
