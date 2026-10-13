import { describe, expect, it } from "vitest";
import { parseFlutterwavePayoutRecipientCode } from "@/lib/payments/flutterwave-transfer";

describe("parseFlutterwavePayoutRecipientCode", () => {
  it("parses fw:bank:account recipient codes", () => {
    expect(parseFlutterwavePayoutRecipientCode("fw:058:0123456789")).toEqual({
      bankCode: "058",
      accountNumber: "0123456789",
    });
  });

  it("returns null for Paystack recipient codes", () => {
    expect(parseFlutterwavePayoutRecipientCode("RCP_abc123")).toBeNull();
  });
});
