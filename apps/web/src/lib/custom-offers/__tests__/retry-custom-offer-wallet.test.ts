import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: async () => "tenant-1",
}));

describe("retryCustomOfferWalletStillDue", () => {
  it("returns the wallet once and clears the mark", async () => {
    const updates: Record<string, unknown>[] = [];
    const credits: Record<string, unknown>[] = [];
    const admin = {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.limit = self;
        chain.update = (payload: Record<string, unknown>) => {
          updates.push(payload);
          return chain;
        };
        chain.maybeSingle = async () =>
          table === "user_wallets" ? { data: { id: "wallet-1", currency: "ZAR" }, error: null } : { data: null, error: null };
        chain.then = (resolve: (value: unknown) => unknown) => {
          if (table === "custom_offers" && updates.length === 0) {
            return resolve({
              data: [{ id: "offer-1", provider_id: "prov-1", request: { customer_id: "cust-1" } }],
              error: null,
            });
          }
          if (table === "wallet_transactions") {
            return resolve({
              data: [{ amount: 40, type: "debit", reference_type: "custom_offer" }],
              error: null,
            });
          }
          return resolve({ data: [{ id: "offer-1" }], error: null });
        };
        return chain;
      },
      rpc: async (_name: string, args: Record<string, unknown>) => {
        credits.push(args);
        return { error: null };
      },
    };

    const { retryCustomOfferWalletStillDue } = await import("../credit-wallet-for-offer-abandon");
    const finished = await retryCustomOfferWalletStillDue(admin as never);

    expect(finished).toBe(1);
    expect(credits[0]?.p_amount).toBe(40);
    expect(credits[0]?.p_idempotency_key).toBe("custom_offer_wallet_reversal:offer-1:4000");
    expect(updates.some((row) => row.payment_reference === null)).toBe(true);
  });

  it("keeps the mark when the wallet return does not finish", async () => {
    const updates: Record<string, unknown>[] = [];
    const admin = {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.limit = self;
        chain.update = (payload: Record<string, unknown>) => {
          updates.push(payload);
          return chain;
        };
        chain.maybeSingle = async () =>
          table === "user_wallets" ? { data: { id: "wallet-1", currency: "ZAR" }, error: null } : { data: null, error: null };
        chain.then = (resolve: (value: unknown) => unknown) => {
          if (table === "wallet_transactions") {
            return resolve({
              data: [{ amount: 40, type: "debit", reference_type: "custom_offer" }],
              error: null,
            });
          }
          return resolve({
            data: [{ id: "offer-1", provider_id: "prov-1", request: { customer_id: "cust-1" } }],
            error: null,
          });
        };
        return chain;
      },
      rpc: async () => ({ error: { message: "wallet down" } }),
    };

    const { retryCustomOfferWalletStillDue } = await import("../credit-wallet-for-offer-abandon");
    const finished = await retryCustomOfferWalletStillDue(admin as never);

    expect(finished).toBe(0);
    expect(updates.some((row) => row.payment_reference === null)).toBe(false);
  });
});
