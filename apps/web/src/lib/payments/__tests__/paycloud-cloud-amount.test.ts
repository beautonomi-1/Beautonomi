import { describe, expect, it } from "vitest";
import {
  formatPaycloudCloudOrderAmount,
  normalizePaycloudMajorAmount,
  parsePaycloudCloudCapturedAmount,
} from "../paycloud-cloud-amount";
import { buildCreatePaycloudOrderBusinessParams } from "../paycloud-client";

describe("normalizePaycloudMajorAmount", () => {
  it("rounds to two decimal places", () => {
    expect(normalizePaycloudMajorAmount(10.005)).toBe(10.01);
    expect(normalizePaycloudMajorAmount(50)).toBe(50);
  });
});

describe("formatPaycloudCloudOrderAmount", () => {
  it("formats ZAR with two decimal places as string", () => {
    expect(formatPaycloudCloudOrderAmount("ZAR", 10)).toBe("10.00");
    expect(formatPaycloudCloudOrderAmount("ZAR", 150.5)).toBe("150.50");
    expect(formatPaycloudCloudOrderAmount("ZAR", 0.01)).toBe("0.01");
  });

  it("rounds before formatting", () => {
    expect(formatPaycloudCloudOrderAmount("ZAR", 10.005)).toBe("10.01");
  });
});

describe("parsePaycloudCloudCapturedAmount", () => {
  it("parses gateway major-unit amounts (decimal or integer strings)", () => {
    expect(parsePaycloudCloudCapturedAmount("ZAR", "10.00")).toBe(10);
    expect(parsePaycloudCloudCapturedAmount("ZAR", "150.50")).toBe(150.5);
    // UAT ecrorder echoes trans_amount as integer major units (e.g. 50 for R50).
    expect(parsePaycloudCloudCapturedAmount("ZAR", "50")).toBe(50);
    expect(parsePaycloudCloudCapturedAmount("ZAR", 200)).toBe(200);
  });
});

describe("cloud payment amount pipeline (app → PayCloud → settlement)", () => {
  const base = {
    merchant_no: "322600014105",
    store_no: "4226000567",
    terminal_sn: "WPHK002434000635",
    merchant_order_no: "BN_TEST",
    price_currency: "ZAR",
    pay_scenario: "SWIPE_CARD",
    notify_url: "https://app.beautonomi.com/api/provider/paycloud/webhook",
  };

  it("formats provider app major-unit charge for Cloud API", () => {
    const business = buildCreatePaycloudOrderBusinessParams({
      ...base,
      order_amount: 50,
    });
    expect(business.order_amount).toBe("50.00");
    expect(typeof business.order_amount).toBe("string");
    expect(JSON.stringify(business)).toContain('"order_amount":"50.00"');
  });

  it("round-trips UAT gateway capture for settlement comparison", () => {
    const sent = formatPaycloudCloudOrderAmount("ZAR", 50);
    expect(sent).toBe("50.00");
    // Gateway may echo trans_amount as "50" or "50.00" — both are major units.
    expect(parsePaycloudCloudCapturedAmount("ZAR", "50")).toBe(50);
    expect(parsePaycloudCloudCapturedAmount("ZAR", "50.00")).toBe(50);
    expect(
      Math.abs(parsePaycloudCloudCapturedAmount("ZAR", "50") - normalizePaycloudMajorAmount(50)) <
        0.01,
    ).toBe(true);
  });
});
