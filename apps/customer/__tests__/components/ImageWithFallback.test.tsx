import React from "react";
import { render, screen } from "@testing-library/react-native";
import { ImageWithFallback } from "@/components/ImageWithFallback";

jest.mock("expo-image", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Image: ({ accessibilityLabel, ...props }: { accessibilityLabel?: string }) =>
      React.createElement(View, { accessibilityLabel, testID: "expo-image", ...props }),
  };
});

describe("ImageWithFallback", () => {
  it("renders image when source is provided", () => {
    render(
      <ImageWithFallback
        source={{ uri: "https://example.com/image.jpg" }}
        style={{ width: 100, height: 100 }}
        accessibilityLabel="Test image"
      />
    );
    expect(screen.getByLabelText("Test image")).toBeTruthy();
  });

  it("renders fallback when source is null", () => {
    render(
      <ImageWithFallback
        source={null as unknown as undefined}
        fallbackText="JD"
        style={{ width: 100, height: 100 }}
      />
    );
    expect(screen.getByText("J")).toBeTruthy();
  });

  it("renders fallback text initial", () => {
    render(
      <ImageWithFallback
        source={null as unknown as undefined}
        fallbackText="Beauty Salon"
        style={{ width: 48, height: 48 }}
      />
    );
    expect(screen.getByText("B")).toBeTruthy();
  });
});
