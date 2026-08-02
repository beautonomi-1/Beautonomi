import { describe, expect, it } from "vitest";
import { parsePaycloudResponse } from "../paycloud-client";

describe("parsePaycloudResponse", () => {
  it("reads trans_status and amounts from nested data (orderquery envelope)", () => {
    // PayCloud Cloud API: order_amount/paid_amount are major units (e.g. "200" = R200.00).
    const raw = {
      code: "0",
      msg: "success",
      psn: "0905071445",
      sign: "sig",
      data: {
        trans_no: "50210004102306140000003",
        trans_status: 2,
        order_amount: "200",
        paid_amount: "200",
        merchant_order_no: "TEST_1",
        price_currency: "ZAR",
      },
    };
    const parsed = parsePaycloudResponse(raw);
    expect(parsed.success).toBe(true);
    expect(parsed.trans_status).toBe("2");
    expect((parsed.raw as Record<string, unknown>).paid_amount).toBe("200");
    expect((parsed.raw as Record<string, unknown>).order_amount).toBe("200");
  });

  it("treats code 000/103 flat responses (ecrorder) as success", () => {
    expect(parsePaycloudResponse({ response_code: "000" }).success).toBe(true);
    expect(parsePaycloudResponse({ response_code: "103" }).success).toBe(true);
  });

  it("surfaces error message on business failure", () => {
    const parsed = parsePaycloudResponse({ code: "106", msg: "declined" });
    expect(parsed.success).toBe(false);
    expect(parsed.error_message).toBe("declined");
  });

  it("reads flat trans_status when not nested (notify-style)", () => {
    const parsed = parsePaycloudResponse({ response_code: "000", trans_status: 2 });
    expect(parsed.trans_status).toBe("2");
  });
});
