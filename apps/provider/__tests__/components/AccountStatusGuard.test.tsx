import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

const mockReplace = jest.fn();
const mockSignOut = jest.fn();
const mockApiGet = jest.fn();
const mockApiPost = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({
    session: { user: { id: "provider-user-1" } },
    signOut: mockSignOut,
  }),
}));

jest.mock("@/lib/api-client", () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

jest.mock("@/lib/sentry", () => ({
  authFlowBreadcrumb: jest.fn(),
  captureAuthMessage: jest.fn(),
  captureError: jest.fn(),
  isSentryEnabled: () => false,
  setAuthFlowTags: jest.fn(),
  setAuthGateContext: jest.fn(),
}));

import { AccountStatusGuard } from "@/components/AccountStatusGuard";

describe("AccountStatusGuard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders children after an active account status check", async () => {
    mockApiGet.mockResolvedValueOnce({
      data: { is_deactivated: false, is_suspended: false },
    });

    const screen = render(
      <AccountStatusGuard>
        <Text>Provider shell</Text>
      </AccountStatusGuard>,
    );

    await waitFor(() => expect(screen.getByText("Provider shell")).toBeTruthy());
  });

  it("fails closed when account status cannot be verified", async () => {
    mockApiGet.mockResolvedValue({ error: { message: "Account status unavailable", status: 400 } });

    const screen = render(
      <AccountStatusGuard>
        <Text>Provider shell</Text>
      </AccountStatusGuard>,
    );

    await waitFor(() => expect(screen.getByText("Account check needed")).toBeTruthy());
    expect(screen.queryByText("Provider shell")).toBeNull();

    fireEvent.press(screen.getByText("Sign out"));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("retries the account status check from the error gate", async () => {
    mockApiGet
      .mockResolvedValueOnce({ error: { message: "Account status unavailable", status: 400 } })
      .mockResolvedValueOnce({ data: { is_deactivated: false, is_suspended: false } });

    const screen = render(
      <AccountStatusGuard>
        <Text>Provider shell</Text>
      </AccountStatusGuard>,
    );

    await waitFor(() => expect(screen.getByText("Account check needed")).toBeTruthy());

    fireEvent.press(screen.getByText("Try again"));

    await waitFor(() => expect(screen.getByText("Provider shell")).toBeTruthy());
  });

  it("reactivates inactivity-deactivated provider accounts before rendering children", async () => {
    mockApiGet
      .mockResolvedValueOnce({
        data: {
          is_deactivated: true,
          is_suspended: false,
          deactivated_by: "inactive_retention",
        },
      })
      .mockResolvedValueOnce({ data: { is_deactivated: false, is_suspended: false } });
    mockApiPost.mockResolvedValueOnce({ data: { reactivated: true } });

    const screen = render(
      <AccountStatusGuard>
        <Text>Provider shell</Text>
      </AccountStatusGuard>,
    );

    await waitFor(() => expect(screen.getByText("Provider shell")).toBeTruthy());
    expect(mockApiPost).toHaveBeenCalledWith("/api/me/reactivate-account", {});
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
