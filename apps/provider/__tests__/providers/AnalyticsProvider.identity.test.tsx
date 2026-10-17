import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

const mockReset = jest.fn();
const mockIdentify = jest.fn();
const mockInitAnalytics = jest.fn();
const mockResetAnalyticsModule = jest.fn();
const mockUnsetSingular = jest.fn();
const mockUseAuth = jest.fn();

jest.mock("@/providers/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock("@/lib/analytics-rn", () => ({
  initAnalytics: (...args: unknown[]) => mockInitAnalytics(...args),
  resetAnalyticsModule: () => mockResetAnalyticsModule(),
  handleEngagementURL: jest.fn(() => Promise.resolve(false)),
  getMobileAnalyticsAttribution: () => ({}),
  captureMarketingAttributionFromUrl: jest.fn(() => Promise.resolve()),
  getCachedFirstTouchForIdentify: () => ({}),
}));

jest.mock("@/lib/analytics", () => ({
  setAnalyticsInstance: jest.fn(),
  trackAppOpen: jest.fn(),
  trackDeepLinkOpened: jest.fn(),
}));

jest.mock("@/lib/singular", () => ({
  setSingularCustomUserId: jest.fn(),
  unsetSingularCustomUserId: () => mockUnsetSingular(),
}));

jest.mock("@/lib/api-client", () => ({
  api: {
    get: jest.fn(() => Promise.resolve({ data: { analytics_consent: true } })),
    post: jest.fn(() => Promise.resolve({ data: { provider_id: "p1" } })),
  },
}));

jest.mock("@/config/public-env", () => ({ APP_URL: "https://beautonomi.com" }));

jest.mock("@/lib/tracking/request-att-before-tracking", () => ({
  attBootstrapPromise: Promise.resolve(),
}));

jest.mock("@beautonomi/analytics", () => ({
  fetchAmplitudeConfig: jest.fn(() =>
    Promise.resolve({
      api_key_public: "key",
      enabled_provider_portal: true,
      guides_enabled: false,
      surveys_enabled: false,
    }),
  ),
}));

import { AnalyticsProvider } from "@/providers/AnalyticsProvider";

const tree = () => (
  <AnalyticsProvider>
    <Text>app</Text>
  </AnalyticsProvider>
);

describe("Provider AnalyticsProvider identity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitAnalytics.mockResolvedValue({
      track: jest.fn(),
      identify: mockIdentify,
      setGroup: jest.fn(),
      reset: mockReset,
      flush: jest.fn(),
    });
    mockUseAuth.mockReturnValue({ user: { id: "provider-a" } });
  });

  it("does not reset or re-identify when only the user object reference changes", async () => {
    const screen = render(tree());
    await waitFor(() => expect(mockIdentify).toHaveBeenCalledTimes(1));
    mockUseAuth.mockReturnValue({ user: { id: "provider-a", updated_at: "new" } });
    screen.rerender(tree());
    await new Promise((r) => setTimeout(r, 50));
    expect(mockIdentify).toHaveBeenCalledTimes(1);
    expect(mockReset).not.toHaveBeenCalled();
  });

  it("resets Amplitude and Singular on sign-out", async () => {
    const screen = render(tree());
    await waitFor(() => expect(mockIdentify).toHaveBeenCalled());
    mockUseAuth.mockReturnValue({ user: null });
    screen.rerender(tree());
    await waitFor(() => expect(mockReset).toHaveBeenCalled());
    expect(mockUnsetSingular).toHaveBeenCalled();
    expect(mockResetAnalyticsModule).toHaveBeenCalled();
  });
});
