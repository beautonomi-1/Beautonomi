import { describe, expect, it } from "vitest";
import { orphanPaymentTxBelongsToTenant, type OrphanPaymentTxTenantScope } from "./payment-transactions-tenant-scope";

function ctx(partial: Partial<OrphanPaymentTxTenantScope> = {}): OrphanPaymentTxTenantScope {
  return {
    giftOrderIds: partial.giftOrderIds ?? new Set(),
    membershipOrderIds: partial.membershipOrderIds ?? new Set(),
    tenantProviderIds: partial.tenantProviderIds ?? new Set(),
  };
}

describe("orphanPaymentTxBelongsToTenant", () => {
  it("returns true for gift_card_order when order id is in set", () => {
    expect(
      orphanPaymentTxBelongsToTenant(
        { metadata: { kind: "gift_card_order", gift_card_order_id: "g1" } },
        ctx({ giftOrderIds: new Set(["g1"]) }),
      ),
    ).toBe(true);
  });

  it("returns false for gift_card_order when order id is not in set", () => {
    expect(
      orphanPaymentTxBelongsToTenant(
        { metadata: { kind: "gift_card_order", gift_card_order_id: "g1" } },
        ctx({ giftOrderIds: new Set(["other"]) }),
      ),
    ).toBe(false);
  });

  it("returns true for membership_order when id matches", () => {
    expect(
      orphanPaymentTxBelongsToTenant(
        { metadata: { kind: "membership_order", membership_order_id: "m1" } },
        ctx({ membershipOrderIds: new Set(["m1"]) }),
      ),
    ).toBe(true);
  });

  it("returns true for provider subscription kinds when provider_id is in tenant", () => {
    const meta = { kind: "provider_subscription_order", provider_id: "p1" };
    expect(
      orphanPaymentTxBelongsToTenant({ metadata: meta }, ctx({ tenantProviderIds: new Set(["p1"]) })),
    ).toBe(true);
  });

  it("returns false for unknown kind", () => {
    expect(
      orphanPaymentTxBelongsToTenant(
        { metadata: { kind: "other", provider_id: "p1" } },
        ctx({ tenantProviderIds: new Set(["p1"]) }),
      ),
    ).toBe(false);
  });

  it("returns false when metadata missing", () => {
    expect(orphanPaymentTxBelongsToTenant({ metadata: undefined }, ctx())).toBe(false);
  });
});
