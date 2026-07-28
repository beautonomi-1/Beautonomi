import { describe, expect, it } from "vitest";
import {
  formatCardPaymentHistoryLabel,
  manualCardCollectOptionLabel,
  manualCardReportLabel,
} from "../card-machine-labels";

describe("card-machine-labels", () => {
  it("distinguishes paycloud, yoco and manual card", () => {
    expect(formatCardPaymentHistoryLabel({ payment_provider: "paycloud" })).toBe(
      "Beautonomi card machine",
    );
    expect(formatCardPaymentHistoryLabel({ payment_provider: "yoco" })).toBe(
      "Yoco card machine",
    );
    expect(formatCardPaymentHistoryLabel({ payment_method: "card" })).toBe("Card (recorded)");
  });

  it("uses consistent manual collect and report labels", () => {
    expect(manualCardCollectOptionLabel()).toBe("Card — already taken");
    expect(manualCardReportLabel()).toBe("Card (recorded)");
  });

  it("does not use terminal in provider-facing labels except Paystack product name allowance", () => {
    const labels = [
      formatCardPaymentHistoryLabel({ payment_provider: "paycloud" }),
      formatCardPaymentHistoryLabel({ payment_provider: "yoco" }),
      manualCardCollectOptionLabel(),
      manualCardReportLabel(),
    ];
    for (const label of labels) {
      expect(label.toLowerCase()).not.toContain("terminal");
    }
  });
});
