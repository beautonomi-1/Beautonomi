import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { DeviceEventEmitter, Platform, Text } from "react-native";

/**
 * `/api/provider/devices` is role-gated, so it can reject during provider
 * onboarding. Three separate code paths register the device (the initial
 * subscription plus its 2.5s/10s/30s retry ladder, the post-onboarding retry,
 * and the foreground re-register), and they must all honour a single deferral:
 * one rejection stops the rest, and a role change re-arms them. Getting this
 * wrong either spams the endpoint or silently leaves the device unregistered.
 *
 * Timers are faked so the retry ladder is driven deterministically rather than
 * by waiting on real time, which made assertions depend on machine load.
 */

const mockApiPost = jest.fn();

// `user` and `gate` are effect dependencies, so they must keep a stable identity
// across renders exactly as the real context providers do — otherwise every
// render re-runs the registration effects and the test measures the harness.
jest.mock("@/providers/AuthProvider", () => {
  const user = { id: "provider-user-1" };
  return { useAuth: () => ({ user }) };
});

jest.mock("@/providers/NativePermissionsOnboardingProvider", () => {
  const gate = { phase: "complete", fromRestore: false };
  return { useNativePermissionsOnboardingGate: () => ({ gate }) };
});

jest.mock("@/providers/InAppBannerProvider", () => ({
  useInAppBanner: () => ({ show: jest.fn() }),
}));

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

jest.mock("@/lib/api-client", () => ({
  api: {
    post: (...args: unknown[]) => mockApiPost(...args),
    get: jest.fn(),
    fetch: jest.fn(),
  },
}));

jest.mock("@/lib/sentry", () => ({
  captureError: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

jest.mock("@/lib/api-error", () => ({
  isTransientApiFailure: () => false,
}));

jest.mock("@/lib/notification-badge-events", () => ({
  emitNotificationBadgeRefresh: jest.fn(),
}));

jest.mock("@/lib/resolveProviderNotificationRoute", () => ({
  applyProviderNotificationRoute: jest.fn(() => true),
  PROVIDER_BOOKING_TEMPLATE_KEYS: new Set<string>(),
}));

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  setBadgeCountAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("react-native-onesignal", () => ({
  OneSignal: {
    Notifications: { addEventListener: jest.fn(), removeEventListener: jest.fn() },
    User: {
      pushSubscription: { addEventListener: jest.fn(), removeEventListener: jest.fn() },
    },
  },
}));

jest.mock("@/lib/onesignal-client", () => ({
  addOneSignalPermissionObserver: jest.fn(() => () => {}),
  requestOneSignalPushPermission: jest.fn(() => Promise.resolve(true)),
  clearPendingPushNotification: jest.fn(),
  clearRegisteredPlayerId: jest.fn(),
  ensureOneSignalInitialized: jest.fn(() => Promise.resolve()),
  ensureOneSignalExternalId: jest.fn(() => Promise.resolve()),
  enqueueOrRoutePushNotification: jest.fn(),
  flushPendingPushNotification: jest.fn(),
  getOneSignalSubscriptionId: jest.fn(() => Promise.resolve("subscription-1")),
  getRegisteredPlayerId: jest.fn(() => Promise.resolve(null)),
  logoutOneSignal: jest.fn(() => Promise.resolve(null)),
  resolveOneSignalAppId: jest.fn(() => Promise.resolve("onesignal-app-1")),
  setPushNavigationReady: jest.fn(),
  setRegisteredPlayerId: jest.fn(),
}));

import { PushNotificationsProvider } from "@/providers/PushNotificationsProvider";
import { PROVIDER_ROLE_CHANGED_EVENT } from "@/lib/provider-role-events";

const FORBIDDEN = {
  data: null,
  error: { message: "Insufficient permissions", code: "FORBIDDEN", status: 403 },
};

const REGISTERED = { data: { registered: true }, error: null };

/** Past the last rung of the 2.5s/10s/30s retry ladder. */
const PAST_RETRY_LADDER_MS = 31_000;

function deviceRegisterCalls(): unknown[][] {
  return mockApiPost.mock.calls.filter((call) => call[0] === "/api/provider/devices");
}

function renderProvider() {
  return render(
    <PushNotificationsProvider>
      <Text>app shell</Text>
    </PushNotificationsProvider>,
  );
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function renderAndSettleFirstAttempt() {
  const screen = renderProvider();
  await waitFor(() => expect(deviceRegisterCalls().length).toBe(1));
  return screen;
}

describe("PushNotificationsProvider device registration deferral", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("stops every rung of the retry ladder after one role rejection", async () => {
    mockApiPost.mockResolvedValue(FORBIDDEN);

    const screen = await renderAndSettleFirstAttempt();
    await advance(PAST_RETRY_LADDER_MS);

    expect(deviceRegisterCalls()).toHaveLength(1);
    screen.unmount();
  });

  it("registers once the role upgrade arrives so push is never silently lost", async () => {
    mockApiPost.mockResolvedValue(FORBIDDEN);

    const screen = await renderAndSettleFirstAttempt();
    mockApiPost.mockResolvedValue(REGISTERED);

    // Mirrors ProviderContext once onboarding upgrades users.role.
    await act(async () => {
      DeviceEventEmitter.emit(PROVIDER_ROLE_CHANGED_EVENT, { role: "provider_owner" });
      await jest.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => expect(deviceRegisterCalls().length).toBe(2));
    expect(mockApiPost).toHaveBeenLastCalledWith("/api/provider/devices", {
      player_id: "subscription-1",
      platform: Platform.OS === "ios" ? "ios" : "android",
    });
    screen.unmount();
  });

  it("retries on the provider_onboarding role, which the route also accepts", async () => {
    mockApiPost.mockResolvedValue(FORBIDDEN);

    const screen = await renderAndSettleFirstAttempt();
    mockApiPost.mockResolvedValue(REGISTERED);

    // A fresh signup is `customer` when the first attempt fails and only becomes
    // `provider_onboarding` later. That is NOT a provider API role, but
    // `/api/provider/devices` accepts it, so registration must be retried or push
    // stays dead for all of onboarding and pending approval.
    await act(async () => {
      DeviceEventEmitter.emit(PROVIDER_ROLE_CHANGED_EVENT, { role: "provider_onboarding" });
      await jest.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => expect(deviceRegisterCalls().length).toBe(2));
    screen.unmount();
  });

  it("does not repeat a registration that already succeeded", async () => {
    mockApiPost.mockResolvedValue(REGISTERED);

    const screen = await renderAndSettleFirstAttempt();
    await advance(PAST_RETRY_LADDER_MS);

    expect(deviceRegisterCalls()).toHaveLength(1);
    screen.unmount();
  });
});
