import { filterUsableGiftCards } from "@/features/gift-cards/filter-usable-gift-cards";

describe("filterUsableGiftCards", () => {
  it("excludes is_for_someone_else and wrong currency", () => {
    const cards = filterUsableGiftCards(
      [
        {
          id: "1",
          code: "GC-A",
          balance: 10,
          currency: "ZAR",
          is_for_someone_else: true,
        },
        {
          id: "2",
          code: "GC-B",
          balance: 10,
          currency: "USD",
        },
        {
          id: "3",
          code: "GC-C",
          balance: 10,
          currency: "ZAR",
        },
      ],
      "ZAR",
    );
    expect(cards.map((c) => c.id)).toEqual(["3"]);
  });
});
