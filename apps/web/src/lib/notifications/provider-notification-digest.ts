import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { providerTemplateKeyToPreferenceSection } from "@/lib/notifications/provider-notification-channels";

export type ProviderDigestMode = "daily" | "weekly";

const DEFERRABLE_PREFERENCE_SECTIONS = new Set(["booking_updates", "booking_cancellations"]);

const NEW_BOOKING_TEMPLATE_KEYS = new Set([
  "provider_booking_request",
  "provider_booking_request_reminder",
  "provider_new_customer",
  "provider_recurring_customer",
  "provider_preferred_customer",
]);

export function shouldDeferProviderPushToDigest(
  prefs: Record<string, unknown> | null | undefined,
  templateKey: string,
): boolean {
  const mode = prefs?.digest_mode;
  if (mode !== "daily" && mode !== "weekly") return false;

  if (NEW_BOOKING_TEMPLATE_KEYS.has(templateKey)) return true;

  const section = providerTemplateKeyToPreferenceSection(templateKey);
  return DEFERRABLE_PREFERENCE_SECTIONS.has(section);
}

export function resolveProviderDigestMode(
  prefs: Record<string, unknown> | null | undefined,
): ProviderDigestMode | null {
  const mode = prefs?.digest_mode;
  if (mode === "daily" || mode === "weekly") return mode;
  return null;
}

export type EnqueueProviderDigestPendingInput = {
  userId: string;
  templateKey: string;
  title: string;
  message: string;
  payload?: Record<string, unknown>;
  digestMode: ProviderDigestMode;
  dedupeKey?: string | null;
};

export async function enqueueProviderDigestPending(
  input: EnqueueProviderDigestPendingInput,
): Promise<void> {
  const admin = getSupabaseAdmin();
  const row = {
    user_id: input.userId,
    template_key: input.templateKey,
    title: input.title,
    message: input.message,
    payload: input.payload ?? {},
    digest_mode: input.digestMode,
    dedupe_key: input.dedupeKey?.trim() || null,
  };

  const { error } = await admin.from("provider_notification_digest_pending").insert(row);
  if (error) {
    if (error.code === "23505") return;
    console.warn("[enqueueProviderDigestPending] insert failed:", error.message);
  }
}

function buildDigestSummary(items: Array<{ title: string; message: string }>): {
  title: string;
  message: string;
} {
  const count = items.length;
  if (count === 1) {
    return { title: items[0].title, message: items[0].message };
  }
  const title =
    count <= 5 ? "Booking updates" : `Booking updates (${count} notifications)`;
  const preview = items
    .slice(0, 3)
    .map((i) => i.message.trim())
    .filter(Boolean)
    .join(" · ");
  const message =
    count > 3
      ? `${count} booking updates while you were on digest mode. ${preview}…`
      : items.map((i) => i.message.trim()).filter(Boolean).join(" · ");
  return { title, message };
}

export async function flushProviderDigests(mode: ProviderDigestMode): Promise<{
  usersNotified: number;
  itemsFlushed: number;
}> {
  const admin = getSupabaseAdmin();
  const { data: rows, error } = await admin
    .from("provider_notification_digest_pending")
    .select("id, user_id, title, message, payload, template_key, created_at")
    .eq("digest_mode", mode)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (error) {
    throw new Error(error.message);
  }
  if (!rows?.length) {
    return { usersNotified: 0, itemsFlushed: 0 };
  }

  const byUser = new Map<
    string,
    Array<{ id: string; title: string; message: string; payload: Record<string, unknown> }>
  >();
  for (const row of rows) {
    const uid = row.user_id as string;
    const list = byUser.get(uid) ?? [];
    list.push({
      id: row.id as string,
      title: String(row.title ?? ""),
      message: String(row.message ?? ""),
      payload: (row.payload as Record<string, unknown>) ?? {},
    });
    byUser.set(uid, list);
  }

  const { sendToUser } = await import("@/lib/notifications/onesignal");
  let usersNotified = 0;
  const flushedIds: string[] = [];

  for (const [userId, items] of byUser) {
    const summary = buildDigestSummary(items);
    const payloadItems = items.map((i) => ({
      title: i.title,
      message: i.message,
      template_key: (i.payload.template_key as string | undefined) ?? null,
      ...(i.payload ?? {}),
    }));

    try {
      await sendToUser(
        userId,
        {
          title: summary.title,
          message: summary.message,
          data: {
            type: "provider_notification_digest",
            digest_mode: mode,
            digest_count: items.length,
            digest_items: payloadItems,
          },
          url: "/provider/notifications",
        },
        ["push"],
        { appType: "provider" },
      );
      usersNotified += 1;
      flushedIds.push(...items.map((i) => i.id));
    } catch (err) {
      console.warn("[flushProviderDigests] send failed for user", userId, err);
    }
  }

  if (flushedIds.length > 0) {
    const { error: delErr } = await admin
      .from("provider_notification_digest_pending")
      .delete()
      .in("id", flushedIds);
    if (delErr) {
      console.warn("[flushProviderDigests] delete failed:", delErr.message);
    }
  }

  return { usersNotified, itemsFlushed: flushedIds.length };
}
