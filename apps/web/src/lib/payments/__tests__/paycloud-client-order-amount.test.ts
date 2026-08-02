import { describe, expect, it } from "vitest";
import { buildCreatePaycloudOrderBusinessParams } from "../paycloud-client";

describe("buildCreatePaycloudOrderBusinessParams", () => {
  const base = {
    merchant_no: "322600014105",
    store_no: "4226000567",
    terminal_sn: "WPHK002434000635",
    merchant_order_no: "BN_TEST_1",
    order_amount: 50,
    price_currency: "ZAR",
    pay_scenario: "SWIPE_CARD",
    notify_url: "https://app.beautonomi.com/api/provider/paycloud/webhook",
  };

  it("formats ZAR order_amount as two-decimal string and omits zero tip", () => {
    const business = buildCreatePaycloudOrderBusinessParams(base);
    expect(business.order_amount).toBe("50.00");
    expect(business.tip_amount).toBeUndefined();
    expect(business.message_receiving_application).toBe("WISECASHIER");
  });

  it("includes tip and cashback only when positive", () => {
    const business = buildCreatePaycloudOrderBusinessParams({
      ...base,
      order_amount: 10.5,
      tip_amount: 2,
      cashback_amount: 5,
    });
    expect(business.order_amount).toBe("10.50");
    expect(business.tip_amount).toBe("2.00");
    expect(business.cashback_amount).toBe("5.00");
    expect(business.trans_type).toBe(11);
  });
});
