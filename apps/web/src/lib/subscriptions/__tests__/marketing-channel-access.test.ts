import { describe, expect, it, vi, beforeEach } from "vitest";
import { assertAutomationChannelAllowed } from "../marketing-channel-access";
import * as featureAccess from "../feature-access";

describe("assertAutomationChannelAllowed", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("allows notification automations without marketing", async () => {
    const result = await assertAutomationChannelAllowed("p1", "notification", {} as never);
    expect(result.ok).toBe(true);
  });

  it("blocks email when marketing is disabled", async () => {
    vi.spyOn(featureAccess, "checkMarketingFeatureAccess").mockResolvedValue({
      enabled: false,
      channels: [],
      advancedSegmentation: false,
      customIntegrations: false,
      usePlatformCredentials: false,
    });

    const result = await assertAutomationChannelAllowed("p1", "email", {} as never);
    expect(result.ok).toBe(false);
  });

  it("allows email when marketing and channel are enabled", async () => {
    vi.spyOn(featureAccess, "checkMarketingFeatureAccess").mockResolvedValue({
      enabled: true,
      channels: ["email"],
      advancedSegmentation: true,
      customIntegrations: false,
      usePlatformCredentials: true,
    });
    vi.spyOn(featureAccess, "canUseMarketingChannel").mockResolvedValue(true);

    const result = await assertAutomationChannelAllowed("p1", "email", {} as never);
    expect(result.ok).toBe(true);
  });
});
