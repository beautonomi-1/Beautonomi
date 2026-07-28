import { describe, expect, it } from "vitest";
import { humanizePaycloudPaymentError, PAYCLOUD_PAYMENT_ERROR_CODES } from "@beautonomi/utils";

describe("paycloud payment errors (utils)", () => {
  it("covers every known error code", () => {
    for (const code of PAYCLOUD_PAYMENT_ERROR_CODES) {
      const h = humanizePaycloudPaymentError(code);
      expect(h.title).toBeTruthy();
      expect(h.message).toBeTruthy();
    }
  });
});
