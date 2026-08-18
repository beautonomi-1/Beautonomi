import React from "react";
import { render } from "@testing-library/react-native";
import { Text } from "react-native";

const mockApiGet = jest.fn();

jest.mock("@/providers/AuthProvider", () => ({
  useAuth: jest.fn(),
}));

jest.mock("@/lib/api-client", () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

jest.mock("@/lib/sentry", () => ({
  authFlowBreadcrumb: jest.fn(),
  captureError: jest.fn(),
  isSentryEnabled: () => false,
  setAuthFlowTags: jest.fn(),
}));

jest.mock("@/components/GateLoadingScreen", () => {
  const { Text: MockText } = require("react-native");
  return {
    GateLoadingScreen: ({ message }: { message: string }) => MockText({ children: message }),
  };
});

import { useAuth } from "@/providers/AuthProvider";
import { RoleGate } from "@/components/RoleGate";

describe("Customer RoleGate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("passes through children when there is no signed-in user (guest browse)", () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null, signOut: jest.fn() });

    const screen = render(
      <RoleGate>
        <Text>Guest shell</Text>
      </RoleGate>,
    );

    expect(screen.getByText("Guest shell")).toBeTruthy();
    expect(mockApiGet).not.toHaveBeenCalled();
  });
});
