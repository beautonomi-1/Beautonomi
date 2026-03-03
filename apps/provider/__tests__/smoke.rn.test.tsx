/**
 * React Native smoke tests. Skipped in default Jest run (pnpm test) due to
 * react-native/jest/setup + Expo + pnpm transform issues. Run manually or in E2E.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { Text, View } from "react-native";

describe.skip("Provider app – RN smoke (run in E2E)", () => {
  it("renders a basic React Native component", () => {
    const { getByText } = render(
      <View>
        <Text>Provider App</Text>
      </View>
    );
    expect(getByText("Provider App")).toBeTruthy();
  });
});
