/**
 * Provider notification preference gating (§Notification-QA-hardening A3).
 *
 * Mirrors the customer channel-intersection contract: a provider's
 * `user_profiles.notification_preferences` can opt a category out of push/email/
 * sms, and the send path must drop those channels. Defaults are opt-in.
 */

import { describe, it, expect, vi } from "vitest";
import {
  providerTemplateKeyToPreferenceSection,
  intersectChannelsForProviderRecipients,
  resolveChannelsPerProviderRecipient,
} from "@/lib/notifications/provider-notification-channels";

function mockSupabase(rows: Array<{ user_id: string; notification_preferences: unknown }>) {
  const result = Promise.resolve({ data: rows, error: null });
  const inFn = vi.fn().mockReturnValue(result);
  const selectFn = vi.fn().mockReturnValue({ in: inFn });
  const from = vi.fn().mockReturnValue({ select: selectFn });
  // Cast: we only exercise the .from().select().in() chain used by the helper.
  return { from } as unknown as Parameters<typeof intersectChannelsForProviderRecipients>[0];
}

describe("providerTemplateKeyToPreferenceSection", () => {
  it("maps template keys to the right preference section", () => {
    expect(providerTemplateKeyToPreferenceSection("booking_cancelled")).toBe("booking_cancellations");
    expect(providerTemplateKeyToPreferenceSection("appointment_reminder")).toBe("booking_reminders");
    expect(providerTemplateKeyToPreferenceSection("customer_new_message")).toBe("client_messages");
    expect(providerTemplateKeyToPreferenceSection("review_response")).toBe("review_responses");
    expect(providerTemplateKeyToPreferenceSection("new_review")).toBe("new_reviews");
    expect(providerTemplateKeyToPreferenceSection("payout_processed")).toBe("payout_updates");
    expect(providerTemplateKeyToPreferenceSection("payment_successful")).toBe("payment_received");
    expect(providerTemplateKeyToPreferenceSection("provider_payment_received")).toBe("payment_received");
    expect(providerTemplateKeyToPreferenceSection("booking_waitlist_available")).toBe(
      "waitlist_notifications",
    );
    expect(providerTemplateKeyToPreferenceSection("subscription_expiring")).toBe("system_updates");
    expect(providerTemplateKeyToPreferenceSection("promo_blast")).toBe("marketing");
    expect(providerTemplateKeyToPreferenceSection("booking_confirmed")).toBe("booking_updates");
  });
});

describe("intersectChannelsForProviderRecipients", () => {
  it("keeps all requested channels when preferences are unset (opt-in defaults)", async () => {
    const supabase = mockSupabase([
      { user_id: "u1", notification_preferences: null },
    ]);
    const result = await intersectChannelsForProviderRecipients(
      supabase,
      ["u1"],
      "booking_confirmed",
      ["push", "email", "sms"],
    );
    expect(result.sort()).toEqual(["email", "push", "sms"]);
  });

  it("drops a channel the provider has opted out of for that category", async () => {
    const supabase = mockSupabase([
      {
        user_id: "u1",
        notification_preferences: { client_messages: { push: false, email: true, sms: true } },
      },
    ]);
    const result = await intersectChannelsForProviderRecipients(
      supabase,
      ["u1"],
      "customer_new_message",
      ["push", "email"],
    );
    expect(result).toEqual(["email"]);
  });

  it("only keeps a channel if EVERY recipient allows it", async () => {
    const supabase = mockSupabase([
      { user_id: "u1", notification_preferences: { payout_updates: { sms: true } } },
      { user_id: "u2", notification_preferences: { payout_updates: { sms: false } } },
    ]);
    const result = await intersectChannelsForProviderRecipients(
      supabase,
      ["u1", "u2"],
      "payout_processed",
      ["push", "sms"],
    );
    expect(result).toEqual(["push"]);
  });

  it("returns an empty array for empty inputs", async () => {
    const supabase = mockSupabase([]);
    expect(
      await intersectChannelsForProviderRecipients(supabase, [], "booking_confirmed", ["push"]),
    ).toEqual([]);
    expect(
      await intersectChannelsForProviderRecipients(supabase, ["u1"], "booking_confirmed", []),
    ).toEqual([]);
  });
});

describe("resolveChannelsPerProviderRecipient", () => {
  it("returns per-user allowances so one opt-out doesn't suppress others", async () => {
    const supabase = mockSupabase([
      { user_id: "u1", notification_preferences: { payout_updates: { sms: true } } },
      { user_id: "u2", notification_preferences: { payout_updates: { sms: false } } },
    ]);
    const perUser = await resolveChannelsPerProviderRecipient(
      supabase,
      ["u1", "u2"],
      "payout_processed",
      ["email", "sms"],
    );
    expect(perUser.get("u1")!.sort()).toEqual(["email", "sms"]);
    expect(perUser.get("u2")).toEqual(["email"]); // u2 kept email, dropped sms
  });

  it("returns an empty map for empty inputs", async () => {
    const supabase = mockSupabase([]);
    expect((await resolveChannelsPerProviderRecipient(supabase, [], "k", ["email"])).size).toBe(0);
    expect(
      (await resolveChannelsPerProviderRecipient(supabase, ["u1"], "k", [])).size,
    ).toBe(0);
  });
});
