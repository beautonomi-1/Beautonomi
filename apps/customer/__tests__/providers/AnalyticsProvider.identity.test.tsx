import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

const mockReset = jest.fn();
const mockIdentify = jest.fn();
const mockInitAnalytics = jest.fn();
const mockResetAnalyticsModule = jest.fn();
const mockUnsetSingular = jest.fn();
const mockSetSingular = jest.fn();
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
  setSingularCustomUserId: (...args: unknown[]) => mockSetSingular(...args),
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
      enabled_client_portal: true,
      guides_enabled: false,
      surveys_enabled: false,
    }),
  ),
}));

import { AnalyticsProvider } from "@/providers/AnalyticsProvider";

describe("AnalyticsProvider identity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitAnalytics.mockResolvedValue({
      track: jest.fn(),
      identify: mockIdentify,
      setGroup: jest.fn(),
      reset: mockReset,
      flush: jest.fn(),
    });
    mockUseAuth.mockReturnValue({ user: { id: "user-a" } });
  });

  it("does not reset when user object reference changes but id is the same", async () => {
    const screen = render(
      <AnalyticsProvider>
        <Text>app</Text>
      </AnalyticsProvider>,
    );
    await waitFor(() => expect(mockIdentify).toHaveBeenCalled());
    mockIdentify.mockClear();
    mockReset.mockClear();
    mockUseAuth.mockReturnValue({ user: { id: "user-a", updated_at: "new" } });
    screen.rerender(
      <AnalyticsProvider>
        <Text>app</Text>
      </AnalyticsProvider>,
    );
    await waitFor(() => expect(mockIdentify).not.toHaveBeenCalled());
    expect(mockReset).not.toHaveBeenCalled();
  });

  it("does not reset on guest-to-user login", async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const screen = render(
      <AnalyticsProvider>
        <Text>app</Text>
      </AnalyticsProvider>,
    );
    await waitFor(() => expect(mockInitAnalytics).toHaveBeenCalled());
    mockReset.mockClear();
    mockUseAuth.mockReturnValue({ user: { id: "user-a" } });
    screen.rerender(
      <AnalyticsProvider>
        <Text>app</Text>
      </AnalyticsProvider>,
    );
    await waitFor(() => expect(mockIdentify).toHaveBeenCalled());
    expect(mockReset).not.toHaveBeenCalled();
  });

  it("resets on sign-out or account switch", async () => {
    const screen = render(
      <AnalyticsProvider>
        <Text>app</Text>
      </AnalyticsProvider>,
    );
    await waitFor(() => expect(mockIdentify).toHaveBeenCalled());
    mockReset.mockClear();
    mockUseAuth.mockReturnValue({ user: null });
    screen.rerender(
      <AnalyticsProvider>
        <Text>app</Text>
      </AnalyticsProvider>,
    );
    await waitFor(() => expect(mockReset).toHaveBeenCalled());
    expect(mockUnsetSingular).toHaveBeenCalled();
    expect(mockResetAnalyticsModule).toHaveBeenCalled();
  });
});
