import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("@/components/ui/BottomSheet", () => ({
  BottomSheet: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/features/catalogue/PricingOptionsEditor", () => ({
  PricingOptionsEditor: () => {
    const { Text } = require("react-native");
    return <Text>PricingOptionsEditor</Text>;
  },
}));

jest.mock("@/components/ui/ChipCombobox", () => ({
  ChipCombobox: () => {
    const { Text } = require("react-native");
    return <Text>ChipCombobox</Text>;
  },
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light" },
}));

import { ServiceFormFields } from "@/features/catalogue/ServiceFormFields";
import { DEFAULT_SERVICE_FORM_STATE } from "@/features/catalogue/service-form-state";

describe("ServiceFormFields", () => {
  const baseProps = {
    value: DEFAULT_SERVICE_FORM_STATE(),
    onChange: jest.fn(),
    categories: [{ id: "cat-1", name: "Hair" }],
    refData: {
      duration: [{ value: "30", label: "30 min" }],
      price_type: [{ value: "fixed", label: "Fixed" }],
      availability: [{ value: "everyone", label: "Everyone" }],
      tax_rate: [{ value: "0", label: "0%" }],
      extra_time: [{ value: "15", label: "15 min" }],
    },
    businessType: "salon" as const,
  };

  it("hides team section in onboarding mode", () => {
    const screen = render(<ServiceFormFields {...baseProps} mode="onboarding" />);
    expect(screen.queryByText("Team members")).toBeNull();
  });

  it("shows team section in catalogue mode by default", () => {
    const screen = render(<ServiceFormFields {...baseProps} mode="catalogue" />);
    expect(screen.getByText("Team members")).toBeTruthy();
  });
});
