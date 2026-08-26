/**
 * ATT bootstrap: Singular.init runs only from AttTrackingBootstrap after ATT.
 */

const mockRequestAtt = jest.fn(async () => "granted");
const mockInitSingular = jest.fn();

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

jest.mock("@/lib/tracking/request-att-before-tracking", () => ({
  requestAttBeforeTracking: (...args: unknown[]) => mockRequestAtt(...args),
}));

jest.mock("@/lib/singular", () => ({
  initSingular: (...args: unknown[]) => mockInitSingular(...args),
}));

import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { AttTrackingBootstrap } from "@/components/AttTrackingBootstrap";

describe("AttTrackingBootstrap (customer)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requests ATT before Singular.init", async () => {
    const order: string[] = [];
    mockRequestAtt.mockImplementation(async () => {
      order.push("att");
      return "granted";
    });
    mockInitSingular.mockImplementation(() => {
      order.push("singular");
    });

    render(<AttTrackingBootstrap />);

    await waitFor(() => {
      expect(mockRequestAtt).toHaveBeenCalledTimes(1);
      expect(mockInitSingular).toHaveBeenCalledTimes(1);
    });
    expect(order).toEqual(["att", "singular"]);
  });
});
