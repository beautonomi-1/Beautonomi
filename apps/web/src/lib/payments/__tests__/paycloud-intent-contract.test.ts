import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAYCLOUD_INTENT_CONTRACT,
  buildSameTerminalIntentPayload,
} from "../paycloud-intent-contract";

describe("buildSameTerminalIntentPayload", () => {
  it("includes app_id and intent_contract on the payload", () => {
    const payload = buildSameTerminalIntentPayload({
      merchantOrderNo: "BN-123",
      chargeAmount: 150.5,
      currency: "ZAR",
      payScenario: "SWIPE_CARD",
      payMethodId: null,
      transType: 1,
      appId: "wz715fc0d10ee9d156",
      intentContract: DEFAULT_PAYCLOUD_INTENT_CONTRACT,
    });

    expect(payload.merchant_order_no).toBe("BN-123");
    expect(payload.order_amount).toBe("150.5");
    expect(payload.price_currency).toBe("ZAR");
    expect(payload.pay_scenario).toBe("SWIPE_CARD");
    expect(payload.app_id).toBe("wz715fc0d10ee9d156");
    expect(payload.intent_contract).toEqual(DEFAULT_PAYCLOUD_INTENT_CONTRACT);
    expect(payload.tip_amount).toBeUndefined();
  });

  it("includes tip and cashback when provided", () => {
    const payload = buildSameTerminalIntentPayload({
      merchantOrderNo: "BN-456",
      chargeAmount: 100,
      currency: "ZAR",
      payScenario: "SWIPE_CARD",
      transType: 11,
      tipAmount: 10,
      cashbackAmount: 20,
      appId: "app-test",
      intentContract: DEFAULT_PAYCLOUD_INTENT_CONTRACT,
    });

    expect(payload.trans_type).toBe(11);
    expect(payload.tip_amount).toBe("10");
    expect(payload.cashback_amount).toBe("20");
  });
});
