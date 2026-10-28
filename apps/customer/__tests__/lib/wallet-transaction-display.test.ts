import {
  walletReferenceTypeLabel,
  walletRowPrimaryLabel,
  walletTransactionNavigation,
  walletTransactionTypeLabel,
} from "@/lib/wallet-transaction-display";

describe("walletTransactionNavigation", () => {
  it("maps booking refund to booking detail", () => {
    expect(
      walletTransactionNavigation({
        id: "1",
        reference_type: "booking_refund",
        reference_id: "abc",
      }),
    ).toEqual({ kind: "booking", id: "abc" });
  });

  it("maps product order refund to order detail", () => {
    expect(
      walletTransactionNavigation({
        id: "1",
        reference_type: "product_order_refund",
        reference_id: "ord-1",
      }),
    ).toEqual({ kind: "product_order", id: "ord-1" });
  });

  it("returns null without reference id", () => {
    expect(
      walletTransactionNavigation({ id: "1", reference_type: "booking", reference_id: "" }),
    ).toBeNull();
  });
});

describe("walletRowPrimaryLabel", () => {
  const tw = (key: string) => `T:${key}`;

  it("prefers server description", () => {
    expect(
      walletRowPrimaryLabel({ id: "1", description: "  Long memo  ", type: "credit" }, tw),
    ).toBe("Long memo");
  });

  it("falls back to translated type", () => {
    expect(walletRowPrimaryLabel({ id: "1", type: "debit" }, tw)).toBe("T:transactionDebit");
  });
});

describe("walletReferenceTypeLabel", () => {
  const tw = (key: string) => key;

  it("translates known reference types", () => {
    expect(walletReferenceTypeLabel("wallet_topup", tw)).toBe("refTypeWalletTopup");
  });
});

describe("walletTransactionTypeLabel", () => {
  it("maps credit and debit", () => {
    const tw = (key: string) => key;
    expect(walletTransactionTypeLabel("credit", tw)).toBe("transactionCredit");
    expect(walletTransactionTypeLabel("debit", tw)).toBe("transactionDebit");
  });
});
