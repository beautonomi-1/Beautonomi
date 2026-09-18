import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";
import { ScreenFrame } from "@/components/ScreenFrame";

jest.mock("@beautonomi/i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock("@/hooks/useThemedColors", () => ({
  useThemedColors: () => ({
    surface: "#fff",
    textPrimary: "#111",
    textSecondary: "#666",
  }),
}));

describe("ScreenFrame header chrome", () => {
  it("renders header during loading", () => {
    const { getByText } = render(
      <ScreenFrame loading header={<Text>Header chrome</Text>}>
        <Text>Body</Text>
      </ScreenFrame>,
    );
    expect(getByText("Header chrome")).toBeTruthy();
  });

  it("renders header on error", () => {
    const { getByText } = render(
      <ScreenFrame error="boom" header={<Text>Header chrome</Text>}>
        <Text>Body</Text>
      </ScreenFrame>,
    );
    expect(getByText("Header chrome")).toBeTruthy();
    expect(getByText("boom")).toBeTruthy();
  });
});
