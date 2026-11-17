import { describe, expect, it } from "vitest";
import {
  creditedGiftCardRedemptionAmount,
  ensureGiftCardWalletRedemptionLedger,
} from "../gift-card-wallet-redemption-ledger";

type Row = Record<string, unknown>;

function makeDb(initial?: {
  credit?: Row | null;
  walletUserId?: string;
  redemptions?: Row[];
  finance?: Row[];
  failLiability?: boolean;
}) {
  const redemptions = [...(initial?.redemptions ?? [])];
  const finance = [...(initial?.finance ?? [])];
  const inserts = { gift_card_redemptions: [] as Row[], finance_transactions: [] as Row[] };

  function match(rows: Row[]) {
    const filters: Array<(row: Row) => boolean> = [];
    const api = {
      select: () => api,
      eq: (key: string, value: unknown) => {
        filters.push((row) => row[key] === value);
        return api;
      },
      in: (key: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[key]));
        return api;
      },
      limit: () => api,
      maybeSingle: async () => ({
        data: rows.find((row) => filters.every((fn) => fn(row))) ?? null,
        error: null,
      }),
    };
    return api;
  }

  return {
    inserts,
    supabase: {
      from: (table: string) => {
        if (table === "wallet_transactions") return match(initial?.credit ? [initial.credit] : []);
        if (table === "user_wallets") {
          return match([{ id: "wallet-1", user_id: initial?.walletUserId ?? "user-1" }]);
        }
        if (table === "gift_card_redemptions") {
          return {
            ...match(redemptions),
            insert: async (row: Row) => {
              inserts.gift_card_redemptions.push(row);
              redemptions.push({ id: "red-1", ...row });
              return { error: null };
            },
          };
        }
        if (table === "finance_transactions") {
          return {
            ...match(finance),
            insert: async (row: Row) => {
              if (initial?.failLiability && row.transaction_type === "gift_card_liability_reduction") {
                return { error: { code: "XX000", message: "db down" } };
              }
              inserts.finance_transactions.push(row);
              finance.push({ id: `fin-${finance.length + 1}`, ...row });
              return { error: null };
            },
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    },
  };
}

describe("gift card wallet redemption ledger", () => {
  it("posts the liability and wallet rows when the credit was already saved", async () => {
    const db = makeDb({
      credit: {
        id: "tx-1",
        wallet_id: "wallet-1",
        amount: 150,
        idempotency_key: "gift_card_redemption:card-1",
      },
    });

    const amount = await creditedGiftCardRedemptionAmount(db.supabase as never, {
      giftCardId: "card-1",
      userId: "user-1",
    });
    expect(amount).toBe(150);

    await ensureGiftCardWalletRedemptionLedger(db.supabase as never, {
      giftCardId: "card-1",
      code: "gift1",
      userId: "user-1",
      amount: amount ?? 0,
      currency: "ZAR",
      tenantId: "tenant-1",
    });

    expect(db.inserts.gift_card_redemptions).toHaveLength(1);
    expect(db.inserts.finance_transactions.map((row) => row.transaction_type)).toEqual([
      "gift_card_liability_reduction",
      "wallet_topup",
    ]);
    expect(db.inserts.finance_transactions[0].net).toBe(-150);
    expect(db.inserts.finance_transactions[1].net).toBe(150);
    expect(db.inserts.finance_transactions[0].description).toBe("Gift card GIFT1 redeemed to wallet");
  });

  it("does not post the rows again when they are already saved", async () => {
    const db = makeDb({
      redemptions: [
        { id: "red-1", gift_card_id: "card-1", user_id: "user-1", status: "captured" },
      ],
      finance: [
        {
          id: "fin-1",
          transaction_type: "gift_card_liability_reduction",
          description: "Gift card GIFT1 redeemed to wallet",
        },
        {
          id: "fin-2",
          transaction_type: "wallet_topup",
          description: "Wallet liability increase from gift card GIFT1 redemption",
        },
      ],
    });

    await ensureGiftCardWalletRedemptionLedger(db.supabase as never, {
      giftCardId: "card-1",
      code: "GIFT1",
      userId: "user-1",
      amount: 150,
      currency: "ZAR",
      tenantId: "tenant-1",
    });

    expect(db.inserts.gift_card_redemptions).toHaveLength(0);
    expect(db.inserts.finance_transactions).toHaveLength(0);
  });

  it("does not credit another person's saved redemption", async () => {
    const db = makeDb({
      credit: { id: "tx-1", wallet_id: "wallet-1", amount: 150, idempotency_key: "gift_card_redemption:card-1" },
      walletUserId: "other-user",
    });

    const amount = await creditedGiftCardRedemptionAmount(db.supabase as never, {
      giftCardId: "card-1",
      userId: "user-1",
    });
    expect(amount).toBeNull();
  });

  it("finds a claim-link credit for the same card", async () => {
    const db = makeDb({
      credit: {
        id: "tx-1",
        wallet_id: "wallet-1",
        amount: 80,
        idempotency_key: "gift_card_claim:card-1:user-1",
      },
    });

    const amount = await creditedGiftCardRedemptionAmount(db.supabase as never, {
      giftCardId: "card-1",
      userId: "user-1",
    });
    expect(amount).toBe(80);
  });

  it("does not post the wallet liability when the gift-card liability was not saved", async () => {
    const db = makeDb({ failLiability: true });

    await expect(
      ensureGiftCardWalletRedemptionLedger(db.supabase as never, {
        giftCardId: "card-1",
        code: "GIFT1",
        userId: "user-1",
        amount: 150,
        currency: "ZAR",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ code: "XX000" });
    expect(db.inserts.finance_transactions).toHaveLength(0);
  });
});
