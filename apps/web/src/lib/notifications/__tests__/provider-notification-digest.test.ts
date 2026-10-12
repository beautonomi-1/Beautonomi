import { describe, expect, it } from "vitest";
import {
  resolveProviderDigestMode,
  shouldDeferProviderPushToDigest,
} from "@/lib/notifications/provider-notification-digest";

describe("shouldDeferProviderPushToDigest", () => {
  it("defers booking updates when digest_mode is daily", () => {
    expect(
      shouldDeferProviderPushToDigest({ digest_mode: "daily" }, "provider_booking_cancelled"),
    ).toBe(true);
  });

  it("does not defer booking reminders", () => {
    expect(
      shouldDeferProviderPushToDigest({ digest_mode: "daily" }, "booking_reminder_24h"),
    ).toBe(false);
  });

  it("does not defer when digest_mode is none", () => {
    expect(
      shouldDeferProviderPushToDigest({ digest_mode: "none" }, "provider_booking_request"),
    ).toBe(false);
  });
});

describe("resolveProviderDigestMode", () => {
  it("returns weekly when configured", () => {
    expect(resolveProviderDigestMode({ digest_mode: "weekly" })).toBe("weekly");
  });
});
