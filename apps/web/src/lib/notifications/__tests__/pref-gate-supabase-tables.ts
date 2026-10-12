import { vi } from "vitest";

const DEFAULT_PROFILE_PREFS: Record<string, unknown> = {
  messages: { email: true, sms: true, push: true, whatsapp: true },
  account_activity: { email: true, sms: true, push: true, whatsapp: true },
  reminders: { email: true, sms: true, push: true, whatsapp: true },
  booking_updates: { email: true, sms: true, push: true, whatsapp: true },
  booking_cancellations: { email: true, sms: true, push: true, whatsapp: true },
  booking_reminders: { email: true, sms: true, push: true, whatsapp: true },
  client_messages: { email: true, sms: true, push: true, whatsapp: true },
  inspiration_and_offers: { email: true, sms: true, push: true, whatsapp: true },
};

/** Minimal Supabase `from()` handlers so sendToUser(s) preference gating succeeds in unit tests. */
export function preferenceGateSupabaseHandlers(
  userIds: string[],
  notificationPreferences?: Record<string, unknown>,
) {
  const usersData = userIds.map((id) => ({
    id,
    phone: "+27123456789",
    email_notifications_enabled: true,
    sms_notifications_enabled: true,
    push_notifications_enabled: true,
    whatsapp_notifications_enabled: true,
    whatsapp_opt_in_at: new Date().toISOString(),
    whatsapp_opted_out_at: null,
    timezone: "Africa/Johannesburg",
  }));
  const mergedPrefs = { ...DEFAULT_PROFILE_PREFS, ...notificationPreferences };
  const profileData = userIds.map((user_id) => ({
    user_id,
    notification_preferences: mergedPrefs,
  }));

  return {
    users: {
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: usersData, error: null }),
      }),
    },
    user_profiles: {
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: profileData, error: null }),
      }),
    },
  };
}

/** No-op handlers for tables touched by template send / badge / digest paths. */
export function ancillarySendPathTableHandler(table: string): unknown | null {
  switch (table) {
    case "notification_delivery_queue":
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "q1" }, error: null }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      };
    case "provider_notification_digest_pending":
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    case "notifications":
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    case "user_badge_sync_state":
      return { upsert: vi.fn().mockResolvedValue({ error: null }) };
    case "providers":
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "prov-1" }, error: null }),
          }),
        }),
      };
    case "provider_staff":
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    case "conversations":
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gt: vi.fn().mockResolvedValue({ data: [], error: null }),
            or: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
    default:
      return null;
  }
}

export function wirePreferenceGateTables(
  fromImpl: (table: string) => unknown,
  userIds: string[],
  notificationPreferences?: Record<string, unknown>,
): (table: string) => unknown {
  const gates = preferenceGateSupabaseHandlers(userIds, notificationPreferences);
  return (table: string) => {
    if (table === "users") return gates.users;
    if (table === "user_profiles") return gates.user_profiles;
    try {
      return fromImpl(table);
    } catch {
      const ancillary = ancillarySendPathTableHandler(table);
      if (ancillary) return ancillary;
      throw new Error(`unexpected table ${table}`);
    }
  };
}
