import { describe, expect, it } from "vitest";
import {
  formatProviderDescriptionDisplay,
  formatProviderDescriptionForCard,
  formatProviderDescriptionForProfilePreview,
  PROVIDER_DESCRIPTION_CARD_MAX,
} from "./formatProviderDescription";

describe("formatProviderDescriptionDisplay", () => {
  it("sentence-cases trimmed text", () => {
    expect(formatProviderDescriptionDisplay("  PREMIUM HAIR & BEAUTY  ")).toBe(
      "Premium hair & beauty",
    );
  });

  it("returns empty for blank input", () => {
    expect(formatProviderDescriptionDisplay(null)).toBe("");
    expect(formatProviderDescriptionDisplay("   ")).toBe("");
  });
});

describe("formatProviderDescriptionForCard", () => {
  it("truncates long descriptions", () => {
    const long = "A".repeat(PROVIDER_DESCRIPTION_CARD_MAX + 40);
    const result = formatProviderDescriptionForCard(long);
    expect(result.length).toBeLessThanOrEqual(PROVIDER_DESCRIPTION_CARD_MAX + 1);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("formatProviderDescriptionForProfilePreview", () => {
  it("keeps short descriptions intact", () => {
    expect(formatProviderDescriptionForProfilePreview("Hello world")).toBe(
      "Hello world",
    );
  });
});
