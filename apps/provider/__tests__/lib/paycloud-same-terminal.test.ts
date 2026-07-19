/**
 * JS bridge fallbacks when the native PayCloud module is absent (Expo Go / iOS).
 */
jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
  NativeModules: {},
}));

import {
  canLaunchPaycloudSameTerminal,
  getPaycloudDeviceSerial,
  startPaycloudSameTerminalSale,
} from "@/lib/paycloud-same-terminal";

describe("paycloud-same-terminal bridge", () => {
  it("canLaunch returns false when native module is missing", async () => {
    await expect(canLaunchPaycloudSameTerminal()).resolves.toBe(false);
  });

  it("getDeviceSerial returns null when native module is missing", async () => {
    await expect(getPaycloudDeviceSerial()).resolves.toBeNull();
  });

  it("startSale returns a friendly message when native module is missing", async () => {
    const result = await startPaycloudSameTerminalSale({
      merchant_order_no: "BN-1",
      order_amount: "10",
      price_currency: "ZAR",
      pay_scenario: "SWIPE_CARD",
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not available/i);
  });
});
