import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { AppState, Platform, Text } from "react-native";

/**
 * `/api/me/devices` accepts every signed-in role, so a rejection means the
 * session itself is bad — retrying it on the 2.5s/10s/30s ladder cannot help.
 * All three registration triggers (initial subscription, post-onboarding retry,
 * foreground re-register) funnel through one function so a single rejection
 * latches them all off, and a foreground gives it one fresh attempt.
 */

const mockApiPost = jest.fn();

jest.mock("@/providers/AuthProvider", () => {
  const user = { id: "customer-user-1" };
  return { useAuth: () => ({ user }) };
});

jest.mock("@/providers/NativePermissionsOnboardingProvider", () => {
  const gate = { phase: "complete", fromRestore: false };
  return { useNativePermissionsOnboardingGate: () => ({ gate }) };
});

jest.mock("expo-router", () => ({ usePathname: () => "/", router: { push: jest.fn() } }));

jest.mock("@beautonomi/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

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

jest.mock("@/lib/api-error", () => ({ isTransientApiFailure: () => false }));

jest.mock("@/lib/analytics", () => ({ trackNotificationOpened: jest.fn() }));

jest.mock("@/lib/notifications", () => ({ navigateFromNotification: jest.fn() }));

jest.mock("@/lib/notification-badge-events", () => ({
  emitNotificationBadgeRefresh: jest.fn(),
}));

jest.mock("react-native-onesignal", () => ({
  OneSignal: {
    Notifications: { addEventListener: jest.fn(), removeEventListener: jest.fn() },
    User: {
      pushSubscription: { addEventListener: jest.fn(), removeEventListener: jest.fn() },
    },
  },
}));

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  setBadgeCountAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("@/lib/onesignal-client", () => ({
  addOneSignalPermissionObserver: jest.fn(() => () => {}),
  requestOneSignalPushPermission: jest.fn(() => Promise.resolve(true)),
  clearPendingPushNotification: jest.fn(),
  clearRegisteredPlayerId: jest.fn(),
  ensureOneSignalExternalId: jest.fn(() => Promise.resolve()),
  ensureOneSignalInitialized: jest.fn(() => Promise.resolve()),
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

const UNAUTHORIZED = {
  data: null,
  error: { message: "Unauthorized", code: "UNAUTHORIZED", status: 401 },
};

const REGISTERED = { data: { registered: true }, error: null };

/** Past the last rung of the 2.5s/10s/30s retry ladder. */
const PAST_RETRY_LADDER_MS = 31_000;

function deviceRegisterCalls(): unknown[][] {
  return mockApiPost.mock.calls.filter((call) => call[0] === "/api/me/devices");
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

function renderProvider() {
  return render(
    <PushNotificationsProvider>
      <Text>app shell</Text>
    </PushNotificationsProvider>,
  );
}

describe("PushNotificationsProvider device registration deferral", () => {
  let appStateHandlers: ((state: string) => void)[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    appStateHandlers = [];
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_type: string, handler: (state: string) => void) => {
        appStateHandlers.push(handler);
        return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("stops the retry ladder after one rejection", async () => {
    mockApiPost.mockResolvedValue(UNAUTHORIZED);

    const screen = renderProvider();
    await waitFor(() => expect(deviceRegisterCalls().length).toBe(1));

    await advance(PAST_RETRY_LADDER_MS);

    expect(deviceRegisterCalls()).toHaveLength(1);
    screen.unmount();
  });

  it("gives registration a fresh attempt on foreground, where the session can change", async () => {
    mockApiPost.mockResolvedValue(UNAUTHORIZED);

    const screen = renderProvider();
    await waitFor(() => expect(deviceRegisterCalls().length).toBe(1));

    mockApiPost.mockResolvedValue(REGISTERED);

    await act(async () => {
      appStateHandlers.forEach((handler) => handler("active"));
      await jest.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => expect(deviceRegisterCalls().length).toBe(2));
    expect(mockApiPost).toHaveBeenLastCalledWith("/api/me/devices", {
      player_id: "subscription-1",
      platform: Platform.OS === "ios" ? "ios" : "android",
      app_type: "customer",
    });
    screen.unmount();
  });

  it("does not re-register after a success", async () => {
    mockApiPost.mockResolvedValue(REGISTERED);

    const screen = renderProvider();
    await waitFor(() => expect(deviceRegisterCalls().length).toBe(1));

    await advance(PAST_RETRY_LADDER_MS);

    expect(deviceRegisterCalls()).toHaveLength(1);
    screen.unmount();
  });
});
