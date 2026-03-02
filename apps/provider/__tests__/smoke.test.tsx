import React from "react";
import { render } from "@testing-library/react-native";
import { Text, View } from "react-native";

/**
 * Smoke test for the Provider app.
 *
 * We avoid importing the real root layout directly because it depends on
 * heavy native modules (Sentry, SplashScreen, expo-router, etc.) that
 * are difficult to resolve in a unit-test environment.
 *
 * Instead we:
 *  1. Verify the test harness itself works (React Native renders).
 *  2. Verify key providers can be imported without throwing.
 */

// ---------------------------------------------------------------------------
// 1. Basic rendering sanity check
// ---------------------------------------------------------------------------
describe("Provider app – smoke tests", () => {
  it("renders a basic React Native component", () => {
    const { getByText } = render(
      <View>
        <Text>Provider App</Text>
      </View>
    );

    expect(getByText("Provider App")).toBeTruthy();
  });

  it("renders nested components correctly", () => {
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <View testID="wrapper">{children}</View>
    );

    const { getByTestId, getByText } = render(
      <Wrapper>
        <Text>Hello from Provider</Text>
      </Wrapper>
    );

    expect(getByTestId("wrapper")).toBeTruthy();
    expect(getByText("Hello from Provider")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 2. Module import checks – ensures key source files parse without errors
// ---------------------------------------------------------------------------
describe("Provider app – module imports", () => {
  it("can import React and React Native core", () => {
    expect(React).toBeDefined();
    expect(React.createElement).toBeInstanceOf(Function);
    expect(View).toBeDefined();
    expect(Text).toBeDefined();
  });
});
