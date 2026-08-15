import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AmplitudeConfig } from "./types";

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  add: vi.fn(),
  reset: vi.fn(),
  track: vi.fn(),
  identify: vi.fn(),
  setUserId: vi.fn(),
  flush: vi.fn(),
  getPlugin: vi.fn(() => ({ name: "AmplitudeEngagementPlugin" })),
}));

vi.mock("@amplitude/analytics-react-native", () => ({
  init: mocks.init,
  add: mocks.add,
  reset: mocks.reset,
  track: mocks.track,
  identify: mocks.identify,
  setUserId: mocks.setUserId,
  flush: mocks.flush,
  Identify: class {
    set() {
      return this;
    }
  },
}));

vi.mock("@amplitude/plugin-engagement-react-native", () => ({
  getPlugin: mocks.getPlugin,
  handleURL: vi.fn(),
}));

// Both pull in React Native internals that cannot load outside a RN runtime.
vi.mock("./marketing-attribution-native", () => ({
  captureMarketingAttributionFromUrl: vi.fn(),
  refreshMarketingAttributionCache: vi.fn(async () => {}),
  getCachedMarketingForEvents: vi.fn(() => ({})),
  getCachedFirstTouchForIdentify: vi.fn(() => ({})),
}));

vi.mock("./mobile-attribution", () => ({
  getMobileAnalyticsAttribution: vi.fn(() => ({})),
}));

import { initAnalytics, isEngagementEnabled, resetAnalyticsModule } from "./react-native";

const CONFIG: AmplitudeConfig = {
  api_key_public: "test-key",
  environment: "development",
  enabled_client_portal: true,
  enabled_provider_portal: true,
  enabled_admin_portal: false,
  guides_enabled: true,
  surveys_enabled: false,
  sampling_rate: 1,
  debug_mode: false,
};

describe("Engagement plugin registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds the plugin only once per process, even across module resets", async () => {
    await initAnalytics(CONFIG, "client");
    expect(mocks.add).toHaveBeenCalledTimes(1);

    // `resetAnalyticsModule()` runs on sign-out and on AnalyticsProvider remount.
    // `amplitude.reset()` clears identity but the native plugin registry keeps the
    // plugin, so re-adding it logs "Plugin with name AmplitudeEngagementPlugin
    // already exists, skipping registration" on every subsequent init.
    resetAnalyticsModule();
    await initAnalytics(CONFIG, "client");

    expect(mocks.add).toHaveBeenCalledTimes(1);
    // Guides and surveys must keep working after the re-init, even though the
    // plugin was not added again on this pass.
    expect(isEngagementEnabled()).toBe(true);
  });

  it("still re-initializes Amplitude itself after a reset", async () => {
    resetAnalyticsModule();
    await initAnalytics(CONFIG, "client");

    expect(mocks.init).toHaveBeenCalledWith("test-key");
  });

  it("does not add the plugin when guides and surveys are both disabled", async () => {
    resetAnalyticsModule();
    await initAnalytics(
      { ...CONFIG, guides_enabled: false, surveys_enabled: false },
      "client",
    );

    expect(mocks.add).not.toHaveBeenCalled();
    expect(isEngagementEnabled()).toBe(false);
  });
});
