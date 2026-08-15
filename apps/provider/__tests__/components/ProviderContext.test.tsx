import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { DeviceEventEmitter, Text } from "react-native";
import { PROVIDER_ROLE_CHANGED_EVENT } from "@/lib/provider-role-events";

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
  captureApiFailure: jest.fn(),
}));

import { ProviderProvider, useProvider } from "@/providers/ProviderContext";
import { captureApiFailure } from "@/lib/sentry";

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

const PROFILE_FIXTURE = {
  id: "prov-1",
  business_name: "Test Salon",
  business_type: "salon",
  email: "a@test.com",
  phone: "+10000000000",
  avatar_url: null,
  locations: [],
};

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

  it("reports resume timeouts to Sentry while keeping cached profile data", async () => {
    let call = 0;
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/api/provider/profile") {
        call += 1;
        if (call === 1) {
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
        return Promise.resolve({
          error: {
            message: "Request timed out. Please check your internet connection and try again.",
            code: "TIMEOUT",
          },
        });
      }
      if (path === "/api/me/role") {
        return Promise.resolve({ data: { role: "provider_owner" } });
      }
      return Promise.resolve({ data: null });
    });

    const screen = renderProvider();
    await waitFor(() => expect(screen.getByTestId("provider").props.children).toBe("prov-1"));

    fireEvent.press(screen.getByTestId("refresh"));
    await waitFor(() => expect(captureApiFailure).toHaveBeenCalled());
    expect(screen.getByTestId("provider").props.children).toBe("prov-1");
    expect(screen.getByTestId("error").props.children).toBe("none");
  });

  it("stops re-requesting the provider profile while the rejected role is unchanged", async () => {
    let profileCalls = 0;
    let roleCalls = 0;
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/api/provider/profile") {
        profileCalls += 1;
        return Promise.resolve({
          error: { message: "Insufficient permissions", status: 403, code: "FORBIDDEN" },
        });
      }
      if (path === "/api/me/role") {
        roleCalls += 1;
        return Promise.resolve({ data: { role: "customer" } });
      }
      return Promise.resolve({ data: null });
    });

    const screen = renderProvider();
    await waitFor(() => expect(screen.getByTestId("role").props.children).toBe("customer"));
    expect(profileCalls).toBe(1);

    fireEvent.press(screen.getByTestId("refresh"));

    // Role is still re-checked, but the endpoint that can only 403 is not.
    await waitFor(() => expect(roleCalls).toBeGreaterThan(1));
    expect(profileCalls).toBe(1);
  });

  it("re-requests the profile as soon as onboarding upgrades the role", async () => {
    let currentRole = "customer";
    let profileCalls = 0;
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/api/provider/profile") {
        profileCalls += 1;
        if (currentRole === "customer") {
          return Promise.resolve({
            error: { message: "Insufficient permissions", status: 403, code: "FORBIDDEN" },
          });
        }
        return Promise.resolve({ data: { ...PROFILE_FIXTURE, id: "prov-upgraded" } });
      }
      if (path === "/api/me/role") {
        return Promise.resolve({ data: { role: currentRole } });
      }
      return Promise.resolve({ data: null });
    });

    const screen = renderProvider();
    await waitFor(() => expect(screen.getByTestId("role").props.children).toBe("customer"));
    expect(profileCalls).toBe(1);

    currentRole = "provider_owner";
    fireEvent.press(screen.getByTestId("refresh"));

    await waitFor(() =>
      expect(screen.getByTestId("provider").props.children).toBe("prov-upgraded"),
    );
    expect(profileCalls).toBe(2);
  });

  it("keeps retrying the profile after a transient failure so a provider is never stranded", async () => {
    let profileCalls = 0;
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/api/provider/profile") {
        profileCalls += 1;
        if (profileCalls === 1) {
          return Promise.resolve({
            error: { message: "Request timed out.", code: "TIMEOUT" },
          });
        }
        return Promise.resolve({ data: { ...PROFILE_FIXTURE, id: "prov-recovered" } });
      }
      if (path === "/api/me/role") {
        // A provider row can exist under this role, so a transient failure must
        // never be mistaken for "this role has no profile to load".
        return Promise.resolve({ data: { role: "provider_onboarding" } });
      }
      return Promise.resolve({ data: null });
    });

    const screen = renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("role").props.children).toBe("provider_onboarding"),
    );
    expect(profileCalls).toBe(1);

    fireEvent.press(screen.getByTestId("refresh"));

    await waitFor(() =>
      expect(screen.getByTestId("provider").props.children).toBe("prov-recovered"),
    );
    expect(profileCalls).toBe(2);
  });

  it("broadcasts PROVIDER_ROLE_CHANGED_EVENT so root-level consumers (push registration) can react", async () => {
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
        return Promise.resolve({ data: { role: "provider_owner" } });
      }
      return Promise.resolve({ data: null });
    });

    const seenRoles: Array<string | null> = [];
    const sub = DeviceEventEmitter.addListener(
      PROVIDER_ROLE_CHANGED_EVENT,
      (payload: { role: string | null }) => {
        seenRoles.push(payload.role);
      },
    );

    try {
      renderProvider();
      await waitFor(() => expect(seenRoles).toContain("provider_owner"));
    } finally {
      sub.remove();
    }
  });
});
