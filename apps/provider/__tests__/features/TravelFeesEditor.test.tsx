import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

import { TravelFeesEditor, formatTravelFeesSummary } from "@/features/travel-fees/TravelFeesEditor";

describe("TravelFeesEditor", () => {
  it("disables tiered pricing when allow_provider_tiered is false", () => {
    const onChange = jest.fn();
    const screen = render(
      <TravelFeesEditor
        value={{
          enabled: true,
          use_platform_default: false,
          pricing_model: "per_km",
        }}
        onChange={onChange}
        platformLimits={{
          provider_min_rate_per_km: 0,
          provider_max_rate_per_km: 50,
          provider_min_minimum_fee: 0,
          provider_max_minimum_fee: 100,
          allow_provider_customization: true,
          allow_provider_tiered: false,
        }}
        currency="ZAR"
        mode="onboarding"
      />,
    );

    fireEvent.press(screen.getByLabelText("Tiered distance pricing"));
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ pricing_model: "tiered" }));
  });

  it("formats travel fee summary for review step", () => {
    const summary = formatTravelFeesSummary(
      {
        enabled: true,
        use_platform_default: false,
        pricing_model: "per_km",
        rate_per_km: 8,
        minimum_fee: 20,
        free_within_km: 5,
      },
      "ZAR",
    );
    expect(summary).toMatch(/km/i);
    expect(summary).toMatch(/min/i);
  });
});
