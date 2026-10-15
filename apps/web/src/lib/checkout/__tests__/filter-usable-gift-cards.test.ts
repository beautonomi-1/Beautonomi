import { describe, expect, it } from "vitest";
import { filterUsableGiftCards } from "../filter-usable-gift-cards";

describe("filterUsableGiftCards", () => {
  it("excludes gifts bought for someone else and empty balances", () => {
    const cards = filterUsableGiftCards(
      [
        {
          id: "1",
          code: "GC-A",
          balance: 50,
          currency: "ZAR",
          is_for_someone_else: true,
        },
        {
          id: "2",
          code: "GC-B",
          balance: 0,
          currency: "ZAR",
        },
        {
          id: "3",
          code: "GC-C",
          balance: 25,
          currency: "ZAR",
        },
      ],
      "ZAR",
    );
    expect(cards.map((c) => c.id)).toEqual(["3"]);
  });
});
