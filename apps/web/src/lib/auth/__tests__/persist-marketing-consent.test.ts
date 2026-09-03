import { describe, expect, it, vi } from "vitest";
import {
  applyMarketingConsentToNotificationPrefs,
  marketingConsentPrivacyPatch,
  persistMarketingConsent,
} from "../persist-marketing-consent";

describe("applyMarketingConsentToNotificationPrefs", () => {
  it("opts in marketing sections when consented", () => {
    const next = applyMarketingConsentToNotificationPrefs(
      { inspiration_and_offers: { push: true }, unsubscribe_marketing: true },
      true,
    );
    expect(next.unsubscribe_marketing).toBe(false);
    expect(next.inspiration_and_offers).toEqual(
      expect.objectContaining({ email: true, sms: true, push: true }),
    );
    expect(next.news_and_programs).toEqual(
      expect.objectContaining({ email: true, sms: true }),
    );
  });

  it("unsubscribes marketing when declined", () => {
    const next = applyMarketingConsentToNotificationPrefs(null, false);
    expect(next.unsubscribe_marketing).toBe(true);
    expect(next.inspiration_and_offers).toEqual(
      expect.objectContaining({ email: false, sms: false }),
    );
  });
});

describe("persistMarketingConsent", () => {
  it("writes marketing_consent onto privacy_settings and notification prefs", async () => {
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const usersUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "users") {
          return { update: usersUpdate };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { privacy_settings: { analytics_consent: true }, notification_preferences: {} },
                error: null,
              }),
            }),
          }),
          update,
        };
      }),
    };

    const result = await persistMarketingConsent(supabase as never, "user-1", true);
    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        privacy_settings: expect.objectContaining({
          marketing_consent: true,
          receive_marketing: true,
          analytics_consent: true,
        }),
        notification_preferences: expect.objectContaining({
          unsubscribe_marketing: false,
        }),
      }),
    );
  });

  it("returns ok:false when the profile update fails", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { privacy_settings: {} }, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: "db down" } }),
        }),
      })),
    };

    const result = await persistMarketingConsent(supabase as never, "user-1", false);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toBe("db down");
    }
  });
});

describe("marketingConsentPrivacyPatch", () => {
  it("keeps receive_marketing aligned with marketing_consent", () => {
    expect(marketingConsentPrivacyPatch(true)).toEqual({
      marketing_consent: true,
      receive_marketing: true,
    });
    expect(marketingConsentPrivacyPatch(false)).toEqual({
      marketing_consent: false,
      receive_marketing: false,
    });
  });
});
