import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { DeviceEventEmitter, Text } from "react-native";

/**
 * Regression guard for the splash-screen freeze:
 * `PushNotificationsProvider` is mounted at the ROOT layout, ABOVE the
 * authenticated `ProviderProvider`. It must therefore NEVER call `useProvider()`
 * directly — doing so throws "useProvider must be used within ProviderProvider"
 * during the root render, which prevents `SplashController` from mounting and
 * leaves the native splash screen up forever. It mirrors the provider role via
 * the `PROVIDER_ROLE_CHANGED_EVENT` broadcast instead.
 */

jest.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({ user: null }),
}));

jest.mock("@/providers/NativePermissionsOnboardingProvider", () => ({
  useNativePermissionsOnboardingGate: () => ({ gate: { phase: "loading" } }),
}));

jest.mock("@/providers/InAppBannerProvider", () => ({
  useInAppBanner: () => ({ show: jest.fn() }),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

jest.mock("@/lib/api-client", () => ({
  api: { post: jest.fn(), get: jest.fn(), fetch: jest.fn() },
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

jest.mock("@/lib/onesignal-client", () => ({
  clearPendingPushNotification: jest.fn(),
  clearRegisteredPlayerId: jest.fn(),
  ensureOneSignalInitialized: jest.fn(() => Promise.resolve()),
  enqueueOrRoutePushNotification: jest.fn(),
  flushPendingPushNotification: jest.fn(),
  getOneSignalSubscriptionId: jest.fn(() => Promise.resolve(null)),
  getOneSignalPermissionAsync: jest.fn(() => Promise.resolve(false)),
  getRegisteredPlayerId: jest.fn(() => Promise.resolve(null)),
  logoutOneSignal: jest.fn(() => Promise.resolve(null)),
  resolveOneSignalAppId: jest.fn(() => Promise.resolve(null)),
  setPushNavigationReady: jest.fn(),
  setRegisteredPlayerId: jest.fn(),
}));

import { PushNotificationsProvider } from "@/providers/PushNotificationsProvider";
import { PROVIDER_ROLE_CHANGED_EVENT } from "@/lib/provider-role-events";

describe("PushNotificationsProvider", () => {
  it("renders children WITHOUT a ProviderProvider ancestor (no useProvider throw)", async () => {
    const screen = render(
      <PushNotificationsProvider>
        <Text>app shell</Text>
      </PushNotificationsProvider>,
    );

    await waitFor(() => expect(screen.getByText("app shell")).toBeTruthy());
  });

  it("does not crash when a provider role is broadcast", async () => {
    const screen = render(
      <PushNotificationsProvider>
        <Text>app shell</Text>
      </PushNotificationsProvider>,
    );

    await waitFor(() => expect(screen.getByText("app shell")).toBeTruthy());

    // Mirrors what ProviderContext emits once the authenticated role resolves.
    act(() => {
      DeviceEventEmitter.emit(PROVIDER_ROLE_CHANGED_EVENT, { role: "provider_owner" });
    });

    await waitFor(() => expect(screen.getByText("app shell")).toBeTruthy());
  });
});
