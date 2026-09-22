import { describe, expect, it } from "vitest";
import {
  isFirstTouchWhatsAppTemplate,
  isTransactionalWhatsAppTemplate,
} from "@/lib/whatsapp/transactional-templates";
import { templateKeyToPreferenceSection } from "@/lib/notifications/customer-notification-channels";

describe("customer WhatsApp journey templates", () => {
  it("treats journey templates as transactional for customers", () => {
    for (const key of [
      "guest_booking_link",
      "booking_reminder_24h",
      "post_visit_whatsapp",
      "account_claim_invite",
      "service_completed",
    ]) {
      expect(isTransactionalWhatsAppTemplate(key, "customer")).toBe(true);
    }
  });

  it("maps post_visit_whatsapp to account_activity preferences", () => {
    expect(templateKeyToPreferenceSection("post_visit_whatsapp")).toBe("account_activity");
  });

  it("flags first-touch templates", () => {
    expect(isFirstTouchWhatsAppTemplate("guest_booking_link")).toBe(true);
    expect(isFirstTouchWhatsAppTemplate("post_visit_whatsapp")).toBe(false);
  });
});
