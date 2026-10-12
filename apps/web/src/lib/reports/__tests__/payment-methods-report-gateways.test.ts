import { describe, expect, it } from "vitest";
import {
  humanizePaymentMethodKey,
  isGatewayCardCaptureProvider,
} from "@/lib/reports/build-payment-methods-report";
import { resolveRecordedTakingsBucket } from "@/lib/reports/recorded-takings";

describe("payment methods report — online gateways", () => {
  it("treats flutterwave like other online gateway captures", () => {
    expect(isGatewayCardCaptureProvider("flutterwave")).toBe(true);
    expect(isGatewayCardCaptureProvider("stripe")).toBe(true);
    expect(isGatewayCardCaptureProvider("paystack")).toBe(true);
  });

  it("humanizes flutterwave for provider UI", () => {
    expect(humanizePaymentMethodKey("flutterwave")).toBe("Flutterwave");
  });

  it("attributes booking_payments by payment_provider for online gateways", () => {
    expect(resolveRecordedTakingsBucket("card", "flutterwave")).toBe("flutterwave");
    expect(resolveRecordedTakingsBucket("card", "stripe")).toBe("stripe");
    expect(resolveRecordedTakingsBucket("card", "paystack")).toBe("paystack");
  });
});
