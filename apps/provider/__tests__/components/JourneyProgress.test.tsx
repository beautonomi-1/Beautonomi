import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("@beautonomi/i18n", () => {
  const en = require("../../../../packages/i18n/src/locales/en.json");
  const lookup = (key: string): unknown =>
    key.split(".").reduce<unknown>(
      (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
      en,
    );
  return {
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, string | number>) => {
        const value = lookup(key);
        if (typeof value !== "string") return key;
        return value.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) => String(opts?.[name] ?? ""));
      },
    }),
  };
});

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

import { JourneyProgress } from "@/components/bookings/JourneyProgress";

describe("JourneyProgress", () => {
  it("renders a translated label for every stage in the full variant", () => {
    const screen = render(<JourneyProgress stage="provider_arrived" />);
    for (const label of ["Confirmed", "En route", "Arrived", "In service", "Done"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByLabelText("Journey progress: Arrived")).toBeTruthy();
  });

  it("shows only the current stage summary in the compact variant", () => {
    const screen = render(<JourneyProgress variant="compact" stage="provider_on_way" />);
    expect(screen.getByText("En route · 2/5")).toBeTruthy();
    expect(screen.queryByText("Arrived")).toBeNull();
  });

  it("uses the section label override for the sticky strip", () => {
    const screen = render(
      <JourneyProgress variant="compact" sticky stage="service_completed" accessibilitySectionLabel="Journey steps" />,
    );
    expect(screen.getByLabelText("Journey steps")).toBeTruthy();
    expect(screen.getByText("Done · 5/5")).toBeTruthy();
  });
});
