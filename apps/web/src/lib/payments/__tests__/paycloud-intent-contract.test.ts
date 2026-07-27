import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAYCLOUD_INTENT_CONTRACT,
  buildSameTerminalIntentPayload,
  formatPaycloudIntentAmountCents,
  mapCloudScenarioToSameTerminal,
  resolveSameTerminalTransType,
} from "../paycloud-intent-contract";

describe("formatPaycloudIntentAmountCents", () => {
  it("zero-pads cents to 12 characters", () => {
    expect(formatPaycloudIntentAmountCents(10)).toBe("000000001000");
    expect(formatPaycloudIntentAmountCents(150.5)).toBe("000000015050");
  });
});

describe("mapCloudScenarioToSameTerminal", () => {
  it("maps cloud scenarios to same-terminal values", () => {
    expect(mapCloudScenarioToSameTerminal("SWIPE_CARD")).toBe("CARD");
    expect(mapCloudScenarioToSameTerminal("BSCANQR_PAY")).toBe("BSCANQR");
    expect(mapCloudScenarioToSameTerminal("SCANQR")).toBe("SCANQR");
  });
});

describe("resolveSameTerminalTransType", () => {
  it("uses CASHBACK when cashback amount is present", () => {
    expect(resolveSameTerminalTransType({ cashbackAmount: 20 })).toBe("CASHBACK");
    expect(resolveSameTerminalTransType({})).toBe("SALE");
  });
});

describe("buildSameTerminalIntentPayload", () => {
  it("builds official SALE payload with nested transData in cents", () => {
    const payload = buildSameTerminalIntentPayload({
      merchantOrderNo: "BN-123",
      chargeAmount: 150.5,
      payScenario: "SWIPE_CARD",
      payMethodId: null,
      appId: "wz715fc0d10ee9d156",
      notifyUrl: "https://example.com/webhook",
      intentContract: DEFAULT_PAYCLOUD_INTENT_CONTRACT,
    });

    expect(payload.version).toBe("A01");
    expect(payload.appId).toBe("wz715fc0d10ee9d156");
    expect(payload.transType).toBe("SALE");
    expect(payload.transData.businessOrderNo).toBe("BN-123");
    expect(payload.transData.paymentScenario).toBe("CARD");
    expect(payload.transData.amt).toBe("000000015050");
    expect(payload.transData.notifyUrl).toBe("https://example.com/webhook");
    expect(payload.transData.POSMode).toBe("1");
    expect(payload.intent_contract).toEqual(DEFAULT_PAYCLOUD_INTENT_CONTRACT);
    expect(payload.transData.tipAmount).toBeUndefined();
  });

  it("includes tip and CASHBACK trans type when cashback is provided", () => {
    const payload = buildSameTerminalIntentPayload({
      merchantOrderNo: "BN-456",
      chargeAmount: 100,
      payScenario: "SWIPE_CARD",
      tipAmount: 10,
      cashbackAmount: 20,
      appId: "app-test",
      intentContract: DEFAULT_PAYCLOUD_INTENT_CONTRACT,
    });

    expect(payload.transType).toBe("CASHBACK");
    expect(payload.transData.tipAmount).toBe("000000001000");
    expect(payload.transData.cashAmount).toBe("000000002000");
  });
});
