import { describe, expect, it } from "vitest";

describe("staff schedule summary helpers", () => {
  it("maps provider schedule template to booking_reminders section", async () => {
    const { providerTemplateKeyToPreferenceSection } = await import(
      "@/lib/notifications/provider-notification-channels"
    );
    expect(providerTemplateKeyToPreferenceSection("provider_schedule_summary")).toBe(
      "booking_reminders",
    );
  });
});
