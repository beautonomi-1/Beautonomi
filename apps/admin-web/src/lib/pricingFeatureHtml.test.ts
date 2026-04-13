import { describe, expect, it } from "vitest";
import { isBlankHtmlContent } from "./pricingFeatureHtml";

describe("isBlankHtmlContent", () => {
  it("matches empty rich-text shells", () => {
    expect(isBlankHtmlContent("")).toBe(true);
    expect(isBlankHtmlContent("<p><br></p>")).toBe(true);
  });

  it("is false when text remains", () => {
    expect(isBlankHtmlContent("<p>Feature</p>")).toBe(false);
  });
});
