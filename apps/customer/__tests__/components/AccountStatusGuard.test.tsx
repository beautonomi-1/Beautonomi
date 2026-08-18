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

const mockUseAuth = jest.fn(() => ({
  session: { user: { id: "customer-user-1" } },
  signOut: mockSignOut,
}));

jest.mock("@/providers/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
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

describe("Customer AccountStatusGuard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockImplementation(() => ({
      session: { user: { id: "customer-user-1" } },
      signOut: mockSignOut,
    }));
  });

  it("passes through children when there is no session (guest browse)", () => {
    mockUseAuth.mockReturnValue({ session: null, signOut: mockSignOut });

    const screen = render(
      <AccountStatusGuard>
        <Text>Guest shell</Text>
      </AccountStatusGuard>,
    );
    expect(screen.getByText("Guest shell")).toBeTruthy();
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it("fails closed when account status cannot be verified", async () => {
    mockApiGet.mockResolvedValue({ error: { message: "Account status unavailable", status: 400 } });

    const screen = render(
      <AccountStatusGuard>
        <Text>Customer shell</Text>
      </AccountStatusGuard>,
    );

    await waitFor(() => expect(screen.getByText("Account check needed")).toBeTruthy());
    expect(screen.queryByText("Customer shell")).toBeNull();

    fireEvent.press(screen.getByText("Sign out"));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("reactivates inactivity-deactivated accounts before rendering children", async () => {
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
        <Text>Customer shell</Text>
      </AccountStatusGuard>,
    );

    await waitFor(() => expect(screen.getByText("Customer shell")).toBeTruthy());
    expect(mockApiPost).toHaveBeenCalledWith("/api/me/reactivate-account", {});
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
