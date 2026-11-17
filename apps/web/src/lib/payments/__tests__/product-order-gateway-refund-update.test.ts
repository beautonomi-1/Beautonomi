import { describe, expect, it } from "vitest";
import {
  productOrderGatewayRefundLedgerShares,
  productOrderGatewayRefundUpdate,
} from "../apply-non-booking-refund-from-transaction";

describe("productOrderGatewayRefundUpdate", () => {
  it("keeps the remainder after a partial gateway refund", () => {
    expect(
      productOrderGatewayRefundUpdate({ orderTotal: 130, alreadyRefunded: 0, refundAmount: 50 }),
    ).toEqual({ payment_status: "partially_refunded", refunded_amount: 50 });
  });

  it("marks a full gateway refund as nothing kept", () => {
    expect(
      productOrderGatewayRefundUpdate({ orderTotal: 130, alreadyRefunded: 50, refundAmount: 80 }),
    ).toEqual({ payment_status: "refunded", refunded_amount: 130 });
  });

  it("does not refund more than the order", () => {
    expect(
      productOrderGatewayRefundUpdate({ orderTotal: 130, alreadyRefunded: 0, refundAmount: 200 }),
    ).toEqual({ payment_status: "refunded", refunded_amount: 130 });
  });

  it("does not add a card refund the order already recorded", () => {
    expect(
      productOrderGatewayRefundUpdate({
        orderTotal: 130,
        alreadyRefunded: 50,
        refundAmount: 50,
        chargeRefunded: 50,
        gatewayRefundsRecorded: 50,
      }),
    ).toEqual({ payment_status: "partially_refunded", refunded_amount: 50 });
  });

  it("adds a later dashboard refund on top of one already stored", () => {
    expect(
      productOrderGatewayRefundUpdate({
        orderTotal: 130,
        alreadyRefunded: 50,
        refundAmount: 30,
        chargeRefunded: 0,
        gatewayRefundsRecorded: 80,
      }),
    ).toEqual({ payment_status: "partially_refunded", refunded_amount: 80 });
  });

  it("keeps a wallet refund that was stored with the card refund", () => {
    expect(
      productOrderGatewayRefundUpdate({
        orderTotal: 130,
        alreadyRefunded: 50,
        refundAmount: 30,
        chargeRefunded: 30,
        gatewayRefundsRecorded: 30,
      }),
    ).toEqual({ payment_status: "partially_refunded", refunded_amount: 50 });
  });

  it("adds a dashboard refund that is not already on the charge", () => {
    expect(
      productOrderGatewayRefundUpdate({
        orderTotal: 130,
        alreadyRefunded: 50,
        refundAmount: 20,
        chargeRefunded: 30,
        gatewayRefundsRecorded: 50,
      }),
    ).toEqual({ payment_status: "partially_refunded", refunded_amount: 70 });
  });
});

describe("productOrderGatewayRefundLedgerShares", () => {
  it("claws the provider share of a partial refund, not the whole customer amount", () => {
    expect(
      productOrderGatewayRefundLedgerShares({
        applied: 50,
        orderTotal: 130,
        capturedProviderEarnings: 120,
        capturedPlatformFee: 10,
        capturedTax: 0,
      }),
    ).toEqual({ providerEarnings: 46.15, platformFee: 3.85, tax: 0 });
  });

  it("claws the refund itself when the order has no earnings posted yet", () => {
    expect(
      productOrderGatewayRefundLedgerShares({
        applied: 50,
        orderTotal: 130,
        capturedProviderEarnings: 0,
        capturedPlatformFee: 0,
        capturedTax: 0,
      }),
    ).toEqual({ providerEarnings: 50, platformFee: 0, tax: 0 });
  });
});
