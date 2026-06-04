import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";

const mockApiGet = jest.fn();

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "new-provider-user" },
  }),
}));

jest.mock("@/lib/api-client", () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

jest.mock("@/lib/active-provider-api-hint", () => ({
  ACTIVE_PROVIDER_ORG_HINT_STORAGE_KEY: "active_provider_hint",
  looksLikeActiveProviderUuid: () => false,
  setActiveProviderApiHint: jest.fn(),
}));

jest.mock("@/lib/sentry", () => ({
  addBreadcrumb: jest.fn(),
  captureError: jest.fn(),
}));

import { ProviderProvider, useProvider } from "@/providers/ProviderContext";

function Probe() {
  const { role, profileLoadError, provider, refresh } = useProvider();
  return (
    <>
      <Text testID="role">{role ?? "none"}</Text>
      <Text testID="error">{profileLoadError ?? "none"}</Text>
      <Text testID="provider">{provider?.id ?? "none"}</Text>
      <Text testID="refresh" onPress={() => void refresh()}>
        refresh
      </Text>
    </>
  );
}

function renderProvider() {
  return render(
    <ProviderProvider>
      <Probe />
    </ProviderProvider>,
  );
}

describe("ProviderProvider first-run profile loading", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps customer onboarding entrants out of the profile error state on expected 403s", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/api/provider/profile") {
        return Promise.resolve({
          error: {
            message: "Insufficient permissions: requires one of provider_owner, provider_staff, superadmin",
            status: 403,
            code: "FORBIDDEN",
          },
        });
      }
      if (path === "/api/me/role") {
        return Promise.resolve({ data: { role: "customer" } });
      }
      return Promise.resolve({ data: null });
    });

    const screen = renderProvider();

    await waitFor(() => expect(screen.getByTestId("role").props.children).toBe("customer"));
    expect(screen.getByTestId("provider").props.children).toBe("none");
    expect(screen.getByTestId("error").props.children).toBe("none");
  });

  it("still surfaces real profile failures for established provider roles", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/api/provider/profile") {
        return Promise.resolve({
          error: {
            message: "Service temporarily unavailable. Please try again later.",
            status: 503,
            code: "SERVICE_UNAVAILABLE",
          },
        });
      }
      if (path === "/api/me/role") {
        return Promise.resolve({ data: { role: "provider_owner" } });
      }
      return Promise.resolve({ data: null });
    });

    const screen = renderProvider();

    await waitFor(() => expect(screen.getByTestId("role").props.children).toBe("provider_owner"));
    expect(screen.getByTestId("provider").props.children).toBe("none");
    expect(screen.getByTestId("error").props.children).toBe("Service temporarily unavailable. Please try again later.");
  });

  it("keeps the last good role when /api/me/role returns CANCELLED after background abort", async () => {
    let call = 0;
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/api/provider/profile") {
        return Promise.resolve({
          data: {
            id: "prov-1",
            business_name: "Test Salon",
            business_type: "salon",
            email: "a@test.com",
            phone: "+10000000000",
            avatar_url: null,
            locations: [],
          },
        });
      }
      if (path === "/api/me/role") {
        call += 1;
        if (call === 1) {
          return Promise.resolve({ data: { role: "provider_owner" } });
        }
        return Promise.resolve({
          error: { message: "Request cancelled.", code: "CANCELLED" },
        });
      }
      return Promise.resolve({ data: null });
    });

    const screen = renderProvider();
    await waitFor(() => expect(screen.getByTestId("role").props.children).toBe("provider_owner"));

    fireEvent.press(screen.getByTestId("refresh"));
    await waitFor(() => expect(call).toBeGreaterThan(1));
    expect(screen.getByTestId("role").props.children).toBe("provider_owner");
  });
});
