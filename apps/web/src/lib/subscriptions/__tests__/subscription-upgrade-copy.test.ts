import { describe, expect, it } from "vitest";
import {
  campaignChannelUpgradeMessage,
  formatChatLimitUpgradeMessage,
  formatLimitUpgradeMessage,
  getUpgradeMessage,
  isPlanGateErrorCode,
} from "../subscription-upgrade-copy";

describe("subscription-upgrade-copy", () => {
  it("isPlanGateErrorCode recognizes all gate codes", () => {
    expect(isPlanGateErrorCode("SUBSCRIPTION_REQUIRED")).toBe(true);
    expect(isPlanGateErrorCode("LIMIT_REACHED")).toBe(true);
    expect(isPlanGateErrorCode("SUBSCRIPTION_LIMIT_EXCEEDED")).toBe(true);
    expect(isPlanGateErrorCode("TERMINAL_LIMIT_REACHED")).toBe(true);
    expect(isPlanGateErrorCode("FORBIDDEN")).toBe(false);
  });

  it("formatChatLimitUpgradeMessage includes counts and upgrade tiers", () => {
    const msg = formatChatLimitUpgradeMessage({
      canProceed: false,
      reason: "Monthly message limit reached",
      currentCount: 2000,
      limitValue: 2000,
      planName: "Beautonomi Starter",
      isUnlimited: false,
    });
    expect(msg.replace(/\u00a0/g, " ")).toMatch(/2[,\s]?000/);
    expect(msg).toContain("Growth");
    expect(msg).toContain("Scale");
    expect(msg).not.toContain("Professional");
  });

  it("formatChatLimitUpgradeMessage for Growth at cap points to Scale only", () => {
    const msg = formatChatLimitUpgradeMessage({
      canProceed: false,
      reason: "Monthly message limit reached",
      currentCount: 8000,
      limitValue: 8000,
      planName: "Beautonomi Growth",
      isUnlimited: false,
    });
    expect(msg).toContain("Scale");
    expect(msg).not.toMatch(/Upgrade to Growth/i);
    expect(msg).not.toContain("Professional");
  });

  it("formatLimitUpgradeMessage for staff includes catalog hint", () => {
    const msg = formatLimitUpgradeMessage(
      {
        canProceed: false,
        reason: "Staff limit reached",
        currentCount: 4,
        limitValue: 4,
        planName: "Beautonomi Starter",
        isUnlimited: false,
      },
      "staff",
    );
    expect(msg).toContain("team member");
    expect(msg).toContain("Starter");
  });

  it("getUpgradeMessage has no Enterprise/Professional strings", () => {
    const keys = [
      "reports.advanced",
      "reports.scale_only",
      "reports.basic",
      "marketing.campaigns",
      "marketing.whatsapp",
      "marketing.segmentation",
      "marketing.automations_channel",
      "marketing.automations",
      "limits.bookings",
      "limits.chat",
      "limits.campaigns",
      "limits.campaign_recipients",
      "limits.express_links",
      "limits.staff",
      "limits.locations",
      "limits.automations",
      "limits.yoco_devices",
      "limits.paycloud_terminals",
      "limits.paystack_terminals",
      "staff.sms",
      "integrations.custom",
      "integrations.calendar",
      "integrations.yoco",
      "integrations.paycloud",
      "integrations.paystack_terminal",
      "express.feature",
      "recurring.feature",
    ] as const;
    for (const key of keys) {
      const msg = getUpgradeMessage(key);
      expect(msg).not.toMatch(/Professional|Enterprise/i);
      expect(msg.length).toBeGreaterThan(20);
    }
  });

  it("reports.advanced names Growth report types including memberships", () => {
    const msg = getUpgradeMessage("reports.advanced");
    expect(msg).toMatch(/memberships/i);
    expect(msg).toContain("Growth");
    expect(msg).toContain("Scale");
  });

  it("campaignChannelUpgradeMessage uses catalog copy", () => {
    expect(campaignChannelUpgradeMessage("whatsapp")).toContain("Scale");
    expect(campaignChannelUpgradeMessage("email")).toContain("Growth");
    expect(campaignChannelUpgradeMessage("sms")).not.toMatch(/require a subscription upgrade/i);
  });
});
