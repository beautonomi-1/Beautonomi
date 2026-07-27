/**
 * JS bridge fallbacks when the native PayCloud module is absent (Expo Go / iOS).
 */
jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
  NativeModules: {},
}));

import {
  canLaunchPaycloudSameTerminal,
  getPaycloudDeviceInfo,
  getPaycloudDeviceSerial,
  humanizePaycloudIntentResult,
  isPaycloudIntentApproved,
  parsePaycloudIntentTransData,
  startPaycloudSameTerminalSale,
} from "@/lib/paycloud-same-terminal";

describe("paycloud-same-terminal bridge", () => {
  it("canLaunch returns false when native module is missing", async () => {
    await expect(canLaunchPaycloudSameTerminal()).resolves.toBe(false);
  });

  it("getDeviceSerial returns null when native module is missing", async () => {
    await expect(getPaycloudDeviceSerial()).resolves.toBeNull();
  });

  it("getDeviceInfo returns empty diagnostics when native module is missing", async () => {
    await expect(getPaycloudDeviceInfo()).resolves.toEqual({
      serial: null,
      manufacturer: null,
      model: null,
      serialSource: null,
    });
  });

  it("startSale returns a friendly message when native module is missing", async () => {
    const result = await startPaycloudSameTerminalSale({
      version: "A01",
      appId: "app-test",
      transType: "SALE",
      transData: {
        businessOrderNo: "BN-1",
        paymentScenario: "CARD",
        amt: "000000001000",
      },
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not available/i);
  });

  it("humanizePaycloudIntentResult maps known codes", () => {
    expect(humanizePaycloudIntentResult("K026")).toMatch(/cancelled/i);
    expect(humanizePaycloudIntentResult("M016")).toMatch(/duplicate/i);
  });

  it("isPaycloudIntentApproved checks result code 00", () => {
    expect(isPaycloudIntentApproved({ success: true, result: "00" })).toBe(true);
    expect(isPaycloudIntentApproved({ success: false, result: "K026" })).toBe(false);
  });

  it("parsePaycloudIntentTransData parses JSON string", () => {
    const parsed = parsePaycloudIntentTransData(
      JSON.stringify({ transactionID: "tx-1", refNo: "ref-1", cardNo: "4302****5723" }),
    );
    expect(parsed?.transactionID).toBe("tx-1");
    expect(parsed?.refNo).toBe("ref-1");
  });
});
