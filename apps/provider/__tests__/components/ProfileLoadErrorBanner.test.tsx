import React from "react";
import { render } from "@testing-library/react-native";

let mockPathname = "/(app)/onboarding";
let mockProviderState = {
  profileLoadError: null as string | null,
  loading: false,
  refresh: jest.fn(),
  role: "customer" as string | null,
};

jest.mock("expo-router", () => ({
  usePathname: () => mockPathname,
}));

jest.mock("@/providers/ProviderContext", () => ({
  useProvider: () => mockProviderState,
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name: string }) => {
    const { Text } = require("react-native");
    return <Text>{name}</Text>;
  },
}));

import { ProfileLoadErrorBanner } from "@/components/ProfileLoadErrorBanner";

describe("ProfileLoadErrorBanner", () => {
  beforeEach(() => {
    mockPathname = "/(app)/onboarding";
    mockProviderState = {
      profileLoadError: null,
      loading: false,
      refresh: jest.fn(),
      role: "customer",
    };
  });

  it("does not show raw provider-profile permission errors during onboarding setup", () => {
    mockProviderState.profileLoadError =
      "Insufficient permissions: requires one of provider_owner, provider_staff, superadmin";

    const screen = render(<ProfileLoadErrorBanner />);

    expect(screen.queryByText("Couldn't load business profile")).toBeNull();
    expect(screen.queryByText(mockProviderState.profileLoadError)).toBeNull();
  });

  it("still shows actionable profile failures outside expected setup states", () => {
    mockPathname = "/(app)/(tabs)/dashboard";
    mockProviderState = {
      profileLoadError: "Service temporarily unavailable. Please try again later.",
      loading: false,
      refresh: jest.fn(),
      role: "provider_owner",
    };

    const screen = render(<ProfileLoadErrorBanner />);

    expect(screen.getByText("Couldn't load business profile")).toBeTruthy();
    expect(screen.getByText("Service temporarily unavailable. Please try again later.")).toBeTruthy();
  });
});
