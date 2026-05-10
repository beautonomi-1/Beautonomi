import { loyaltyHistoryRowsForDisplay } from "@/lib/loyalty-history-rows";

describe("loyaltyHistoryRowsForDisplay", () => {
  it("prefers recent_transactions when present", () => {
    const a = { id: "1" };
    const b = { id: "2" };
    expect(
      loyaltyHistoryRowsForDisplay({
        history: [a, a],
        recent_transactions: [a, b],
      }),
    ).toEqual([a, b]);
  });

  it("does not concatenate history and recent_transactions (no double rows)", () => {
    const row = { id: "x" };
    const rows = loyaltyHistoryRowsForDisplay({
      history: [row],
      recent_transactions: [row],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toBe(row);
  });

  it("falls back to history when recent_transactions empty", () => {
    const row = { id: "h" };
    expect(loyaltyHistoryRowsForDisplay({ history: [row], recent_transactions: [] })).toEqual([row]);
  });
});
