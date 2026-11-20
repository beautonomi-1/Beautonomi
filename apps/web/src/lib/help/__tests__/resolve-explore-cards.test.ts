import { describe, expect, it } from "vitest";
import {
  resolveExploreCards,
  exploreCardImageKey,
  HELP_EXPLORE_DEFAULT_CARDS,
} from "../resolve-explore-cards";

describe("resolveExploreCards", () => {
  it("uses defaults when CMS is empty", () => {
    expect(resolveExploreCards(null)).toEqual(HELP_EXPLORE_DEFAULT_CARDS);
  });

  it("rejects unsafe href and falls back per slot", () => {
    const cards = resolveExploreCards({
      explore_cards: {
        content: JSON.stringify([
          { title: "Bad", description: "Bad", href: "//evil.example" },
          { title: "Good", description: "Good", href: "/learn/policies" },
        ]),
      },
    });
    expect(cards[0].href).toBe(HELP_EXPLORE_DEFAULT_CARDS[0].href);
    expect(cards[1].href).toBe("/learn/policies");
  });

  it("pads with default second card when CMS only has one entry", () => {
    const cards = resolveExploreCards({
      explore_cards: {
        content: JSON.stringify([
          {
            title: "Our community policies",
            description: "Trust",
            href: "/learn/policies",
          },
        ]),
      },
    });
    expect(cards).toHaveLength(2);
    expect(cards[0].href).toBe("/learn/policies");
    expect(cards[1].href).toBe("/learn/provider");
  });
});

describe("exploreCardImageKey", () => {
  it("maps policy and provider paths", () => {
    expect(exploreCardImageKey("/learn/policies")).toBe("/learn/policies");
    expect(exploreCardImageKey("/learn/provider")).toBe("/learn/provider");
    expect(exploreCardImageKey("/learn/article/foo")).toBe("other");
  });
});