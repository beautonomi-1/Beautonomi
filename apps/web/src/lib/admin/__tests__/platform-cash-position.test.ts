import { describe, expect, it } from "vitest";
import {
  buildPlatformCashPosition,
  computeNetPlatformCash,
  computePlatformCashCollected,
} from "../platform-cash-position";

const baseAgg = {
  service_collected_gross: 10_000,
  gift_card_sales: 500,
  subscription_gross: 200,
  ads_gross: 100,
  marketing_credit_gross: 50,
  payouts_paid_total: 6_000,
  refunds_abs_gross: 300,
  payout_transfer_fees: 25,
  gateway_fees_services: 80,
  terminal_gateway_fees: 10,
  subscription_gateway_fees: 5,
  ads_gateway_fees: 2,
  marketing_credit_gateway_fees: 1,
  other_gateway_fees: 3,
  membership_gateway_fees: 4,
};

describe("platform cash position formula", () => {
  it("collected sums service GMV and non-service cash inflows", () => {
    expect(
      computePlatformCashCollected({ agg: baseAgg, walletTopupCashCollected: 1_000 }),
    ).toBe(10_000 + 1_000 + 500 + 200 + 100 + 50);
  });

  it("net platform cash subtracts payouts, refunds, and total gateway fees", () => {
    const gatewayFeesTotal = 80 + 10 + 5 + 2 + 1 + 3 + 4 + 25;
    const collected = 10_000 + 1_000 + 500 + 200 + 100 + 50;
    const net = computeNetPlatformCash({
      agg: baseAgg,
      walletTopupCashCollected: 1_000,
      gatewayFeesTotal,
    });
    expect(net).toBe(collected - 6_000 - 300 - gatewayFeesTotal);
  });

  it("buildPlatformCashPosition matches reconciliation shape", () => {
    const pos = buildPlatformCashPosition({
      agg: baseAgg,
      walletTopupCashCollected: 0,
      gatewayFeesTotal: 100,
    });
    expect(pos.collected).toBe(10_850);
    expect(pos.net_platform_cash).toBe(10_850 - 6_000 - 300 - 100);
    expect(pos.payout_transfer_fees).toBe(25);
  });
});
