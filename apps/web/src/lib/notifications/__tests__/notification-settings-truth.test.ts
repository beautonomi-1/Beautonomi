import { describe, expect, it } from "vitest";
import { templateKeyToPreferenceSection } from "@/lib/notifications/customer-notification-channels";
import { getCustomerNotificationDefaults } from "@/lib/notifications/notification-preferences-defaults";
import { channelAllowedForCustomerUser } from "@/lib/notifications/customer-notification-channels";

describe("notification settings truth — touchpoint mapping", () => {
  it("maps recovery keys to inspiration_and_offers", () => {
    expect(templateKeyToPreferenceSection("abandoned_booking_reminder")).toBe(
      "inspiration_and_offers",
    );
    expect(templateKeyToPreferenceSection("rebook_reminder")).toBe("inspiration_and_offers");
    expect(templateKeyToPreferenceSection("abandoned_cart_reminder")).toBe(
      "inspiration_and_offers",
    );
  });

  it("maps shop and custom offers to account_activity", () => {
    expect(templateKeyToPreferenceSection("product_order_shipped")).toBe("account_activity");
    expect(templateKeyToPreferenceSection("customer_custom_offer")).toBe("account_activity");
  });
});

describe("notification settings truth — defaults and gating", () => {
  it("materialized customer defaults keep transactional push opt-in off", () => {
    const defaults = getCustomerNotificationDefaults({ marketingConsented: false });
    expect((defaults.account_activity as { push?: boolean }).push).toBe(false);
    expect((defaults.reminders as { push?: boolean }).push).toBe(false);
    expect((defaults.messages as { push?: boolean }).push).toBe(true);
  });

  it("honors explicit push off for booking_confirmed", () => {
    const prefs = getCustomerNotificationDefaults({ marketingConsented: false });
    (prefs.account_activity as { push: boolean }).push = false;
    const allowed = channelAllowedForCustomerUser(
      prefs,
      { push_notifications_enabled: true },
      "booking_confirmed",
      "push",
    );
    expect(allowed).toBe(false);
  });

  it("blocks reminders section when booking_reminders master is off", () => {
    const prefs = getCustomerNotificationDefaults({ marketingConsented: false });
    prefs.booking_reminders = false;
    const allowed = channelAllowedForCustomerUser(
      prefs,
      { email_notifications_enabled: true },
      "appointment_reminder",
      "email",
    );
    expect(allowed).toBe(false);
  });
});
