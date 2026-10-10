import { describe, expect, it } from "vitest";
import { isProviderPayoutDestinationReady } from "../payout-rail";

describe("isProviderPayoutDestinationReady", () => {
  it("requires Connect onboarding for stripe rail", () => {
    expect(
      isProviderPayoutDestinationReady({
        payout_rail: "stripe",
        stripe_connect: {
          connect_account_id: "acct_1",
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
          onboarding_complete: true,
          currently_due: [],
          disabled_reason: null,
          external_account_last4: "4242",
        },
      }),
    ).toBe(true);

    expect(
      isProviderPayoutDestinationReady({
        payout_rail: "stripe",
        stripe_connect: {
          connect_account_id: "acct_1",
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
          onboarding_complete: false,
          currently_due: ["external_account"],
          disabled_reason: null,
          external_account_last4: null,
        },
      }),
    ).toBe(false);
  });

  it("treats paystack rail as ready without Connect", () => {
    expect(
      isProviderPayoutDestinationReady({
        payout_rail: "paystack",
        stripe_connect: null,
      }),
    ).toBe(true);
  });
});
