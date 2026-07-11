import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert, Text, View } from "react-native";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSignOut = jest.fn();
const mockRefresh = jest.fn();
const mockUseApi = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useFocusEffect: (callback: () => void) => callback(),
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => {
    const { View } = require("react-native");
    return <View>{children}</View>;
  },
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name: string }) => {
    const { Text } = require("react-native");
    return <Text>{name}</Text>;
  },
}));

jest.mock("@/hooks/useApi", () => ({
  useApi: (...args: unknown[]) => mockUseApi(...args),
}));

jest.mock("@/hooks/useResponsive", () => ({
  useResponsive: () => ({
    screenPadding: 16,
    isTablet: false,
    contentMaxWidth: 720,
  }),
}));

jest.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({
    signOut: mockSignOut,
  }),
}));

jest.mock("@/providers/ProviderContext", () => ({
  useProvider: () => ({
    provider: null,
  }),
}));

jest.mock("@/lib/haptics-safe", () => ({
  hapticLight: jest.fn(),
}));

jest.mock("@/components/ui/ScreenContainer", () => ({
  ScreenContainer: ({ children }: { children: React.ReactNode }) => {
    const { View } = require("react-native");
    return <View>{children}</View>;
  },
}));

jest.mock("@/components/ui/ScreenHeader", () => ({
  ScreenHeader: ({
    title,
    subtitle,
    rightAction,
  }: {
    title: string;
    subtitle?: string;
    rightAction?: React.ReactNode;
  }) => {
    const { Text, View } = require("react-native");
    return (
      <View>
        <Text>{title}</Text>
        {subtitle ? <Text>{subtitle}</Text> : null}
        {rightAction}
      </View>
    );
  },
}));

jest.mock("@/components/ui/LoadingState", () => ({
  LoadingState: () => {
    const { Text } = require("react-native");
    return <Text>Loading</Text>;
  },
}));

jest.mock("@/components/ui/ErrorState", () => ({
  ErrorState: ({ message }: { message: string }) => {
    const { Text } = require("react-native");
    return <Text>{message}</Text>;
  },
}));

import OnboardingHubScreen from "../../app/(app)/onboarding";

describe("OnboardingHubScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      const signOutButton = buttons?.find((button) => button.text === "Sign out");
      void signOutButton?.onPress?.();
    });
    mockSignOut.mockResolvedValue(undefined);
    mockUseApi.mockReturnValue({
      data: {
        isComplete: false,
        completionPercentage: 0,
        steps: [],
      },
      loading: false,
      error: null,
      refresh: mockRefresh,
    });
  });

  it("shows a first-run setup state without a dashboard escape", () => {
    const screen = render(<OnboardingHubScreen />);

    expect(screen.getByText("Start your provider profile")).toBeTruthy();
    expect(screen.getByText("Set up your business profile")).toBeTruthy();
    expect(screen.getByText("Start business setup")).toBeTruthy();
    expect(screen.getByText("Sign out")).toBeTruthy();
    expect(screen.queryByText("Back to dashboard")).toBeNull();
    expect(screen.queryByText("Dashboard")).toBeNull();
  });

  it("signs out before navigating incomplete setup users back to login", async () => {
    const screen = render(<OnboardingHubScreen />);

    fireEvent.press(screen.getByText("Sign out"));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
    expect(mockReplace).not.toHaveBeenCalledWith("/(app)/(tabs)/dashboard");
  });

  it("shows continue setup and dashboard escape when provider profile exists", () => {
    mockUseApi.mockReturnValue({
      data: {
        isComplete: false,
        completionPercentage: 40,
        steps: [
          {
            id: "profile-details",
            title: "Business Details",
            completed: true,
            required: true,
            native_route: "/(app)/(tabs)/more/settings/business",
          },
          {
            id: "services",
            title: "Services",
            completed: false,
            required: true,
            native_route: "/(app)/(tabs)/more/catalogue",
          },
        ],
      },
      loading: false,
      error: null,
      refresh: mockRefresh,
    });

    const screen = render(<OnboardingHubScreen />);

    expect(screen.getByText("Continue setup")).toBeTruthy();
    expect(screen.getByText("Jump to your next incomplete task")).toBeTruthy();
    expect(screen.getByText("Go to dashboard")).toBeTruthy();
    expect(screen.queryByText("Start business setup")).toBeNull();
  });

  it("continue setup navigates to the next incomplete native screen", () => {
    mockUseApi.mockReturnValue({
      data: {
        isComplete: false,
        completionPercentage: 40,
        steps: [
          {
            id: "profile-details",
            title: "Business Details",
            completed: true,
            required: true,
            native_route: "/(app)/(tabs)/more/settings/business",
          },
          {
            id: "services",
            title: "Services",
            completed: false,
            required: true,
            native_route: "/(app)/(tabs)/more/catalogue",
          },
        ],
      },
      loading: false,
      error: null,
      refresh: mockRefresh,
    });

    const screen = render(<OnboardingHubScreen />);
    fireEvent.press(screen.getByText("Continue setup"));

    expect(mockPush).toHaveBeenCalledWith("/(app)/(tabs)/more/catalogue");
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.stringContaining("wizard?focus=identity-verification"),
    );
  });

  it("routes complete providers to the dashboard", () => {
    mockUseApi.mockReturnValue({
      data: {
        isComplete: true,
        completionPercentage: 100,
        steps: [{ id: "profile-details", title: "Business Details", completed: true, required: true }],
      },
      loading: false,
      error: null,
      refresh: mockRefresh,
    });

    const screen = render(<OnboardingHubScreen />);

    fireEvent.press(screen.getAllByText("Dashboard")[0]);

    expect(mockReplace).toHaveBeenCalledWith("/(app)/(tabs)");
  });
});
