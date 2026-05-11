import { describe, expect, it } from "vitest";
import { sumProviderGamificationLedgerNet } from "../sum-gamification-ledger-net";

describe("sumProviderGamificationLedgerNet", () => {
  it("pages through finance rows and floors at zero", async () => {
    const firstPage = Array.from({ length: 1000 }, () => ({ net: 1, amount: 0 }));
    const secondPage = [{ net: -5000, amount: 0 }];
    let call = 0;
    const db = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: () => ({
                  order: () => ({
                    range: () => {
                      const page = call++ === 0 ? firstPage : secondPage;
                      return Promise.resolve({ data: page, error: null });
                    },
                  }),
                }),
              }),
            }),
          }),
        };
      },
    };

    const total = await sumProviderGamificationLedgerNet(db as any, "00000000-0000-0000-0000-000000000001");
    expect(total).toBe(0);
  });

  it("aggregates a full page plus remainder", async () => {
    const first = Array.from({ length: 1000 }, () => ({ net: 1, amount: 0 }));
    const second = [{ net: null, amount: 7 }];
    let call = 0;
    const db = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: () => ({
                  order: () => ({
                    range: () => {
                      const page = call++ === 0 ? first : second;
                      return Promise.resolve({ data: page, error: null });
                    },
                  }),
                }),
              }),
            }),
          }),
        };
      },
    };

    const total = await sumProviderGamificationLedgerNet(db as any, "p");
    expect(total).toBe(1007);
  });
});
