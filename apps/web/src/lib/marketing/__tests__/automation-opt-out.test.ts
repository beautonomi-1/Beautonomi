import { describe, it, expect, vi, beforeEach } from "vitest";

const mockResolveChannels = vi.fn();
vi.mock("@/lib/notifications/customer-notification-channels", () => ({
  resolveChannelsPerCustomerRecipient: (...args: unknown[]) => mockResolveChannels(...args),
}));

import {
  automationChannelToNotificationChannel,
  automationTemplateKey,
  filterAutomationRecipientsByOptOut,
} from "../automation-opt-out";

const supabase = {} as never;

describe("automation opt-out enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps reminder triggers to the reminders section and everything else to marketing", () => {
    expect(automationTemplateKey("appointment_reminder")).toBe("automation_appointment_reminder");
    expect(automationTemplateKey("package_expiring")).toBe("automation_appointment_reminder");
    expect(automationTemplateKey("client_birthday")).toBe("automation_promo");
    expect(automationTemplateKey("client_inactive")).toBe("automation_promo");
    expect(automationTemplateKey("booking_completed")).toBe("automation_promo");
  });

  it("maps the notification action type to the push channel", () => {
    expect(automationChannelToNotificationChannel("notification")).toBe("push");
    expect(automationChannelToNotificationChannel("sms")).toBe("sms");
    expect(automationChannelToNotificationChannel("email")).toBe("email");
    expect(automationChannelToNotificationChannel("whatsapp")).toBe("whatsapp");
  });

  it("skips recipients who opted out of the channel and records the reason", async () => {
    mockResolveChannels.mockResolvedValue(
      new Map([
        ["u1", ["email"]],
        ["u2", []],
        ["u3", ["email"]],
      ]),
    );
    const recipients = [
      { id: "u1", contact: "a@x.com" },
      { id: "u2", contact: "b@x.com" },
      { id: "u3", contact: "c@x.com" },
    ];

    const result = await filterAutomationRecipientsByOptOut(supabase, recipients, {
      triggerType: "client_birthday",
      channel: "email",
    });

    expect(result.allowed.map((r) => r.id)).toEqual(["u1", "u3"]);
    expect(result.skipped).toEqual([{ customerId: "u2", reason: "opted_out:email" }]);
    expect(mockResolveChannels).toHaveBeenCalledWith(supabase, ["u1", "u2", "u3"], "automation_promo", ["email"]);
  });

  it("uses the reminders template key for appointment reminders so transactional prefs apply", async () => {
    mockResolveChannels.mockResolvedValue(new Map([["u1", ["sms"]]]));
    await filterAutomationRecipientsByOptOut(supabase, [{ id: "u1", contact: "+27..." }], {
      triggerType: "appointment_reminder",
      channel: "sms",
    });
    expect(mockResolveChannels).toHaveBeenCalledWith(supabase, ["u1"], "automation_appointment_reminder", ["sms"]);
  });

  it("treats a recipient missing from the preference map as opted out", async () => {
    mockResolveChannels.mockResolvedValue(new Map());
    const result = await filterAutomationRecipientsByOptOut(supabase, [{ id: "ghost", contact: "x" }], {
      triggerType: "seasonal_promotion",
      channel: "notification",
    });
    expect(result.allowed).toEqual([]);
    expect(result.skipped).toEqual([{ customerId: "ghost", reason: "opted_out:push" }]);
  });

  it("fails open when preference lookup throws", async () => {
    mockResolveChannels.mockRejectedValue(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const recipients = [{ id: "u1", contact: "x" }];
    const result = await filterAutomationRecipientsByOptOut(supabase, recipients, {
      triggerType: "client_inactive",
      channel: "email",
    });
    expect(result.allowed).toEqual(recipients);
    expect(result.skipped).toEqual([]);
    warn.mockRestore();
  });

  it("returns empty results for no recipients without hitting the DB", async () => {
    const result = await filterAutomationRecipientsByOptOut(supabase, [], { triggerType: "holiday", channel: "email" });
    expect(result).toEqual({ allowed: [], skipped: [] });
    expect(mockResolveChannels).not.toHaveBeenCalled();
  });
});
