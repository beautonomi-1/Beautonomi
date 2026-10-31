import { describe, expect, it } from "vitest";
import {
  coerceMobileUiLanguage,
  isReviewedUiLanguage,
} from "../language-registry";

describe("isReviewedUiLanguage", () => {
  it("rejects glossary-mash locales", () => {
    expect(isReviewedUiLanguage("zu")).toBe(false);
    expect(isReviewedUiLanguage("af")).toBe(false);
  });

  it("accepts English family catalogs", () => {
    expect(isReviewedUiLanguage("en")).toBe(true);
    expect(isReviewedUiLanguage("en-GB")).toBe(true);
    expect(isReviewedUiLanguage("en-US")).toBe(true);
    expect(isReviewedUiLanguage("en-AU")).toBe(true);
  });
});

describe("coerceMobileUiLanguage", () => {
  it("maps unreviewed saved or device codes to English", () => {
    expect(coerceMobileUiLanguage("zu")).toBe("en");
    expect(coerceMobileUiLanguage("af")).toBe("en");
  });

  it("preserves reviewed codes", () => {
    expect(coerceMobileUiLanguage("en-GB")).toBe("en-GB");
  });
});
