import { describe, expect, it } from "vitest";
import { paymentSuffixRank } from "../settle-card-machine-payment";

describe("paymentSuffixRank", () => {
  it("orders base before tip before cashback for void sequencing", () => {
    expect(paymentSuffixRank("ref:booking-1")).toBe(0);
    expect(paymentSuffixRank("ref:booking-1:tip")).toBe(1);
    expect(paymentSuffixRank("ref:booking-1:cashback")).toBe(2);
    expect(paymentSuffixRank("ref:booking-1:tip")).toBeLessThan(
      paymentSuffixRank("ref:booking-1:cashback"),
    );
    expect(paymentSuffixRank("ref:booking-1")).toBeLessThan(
      paymentSuffixRank("ref:booking-1:tip"),
    );
  });
});
