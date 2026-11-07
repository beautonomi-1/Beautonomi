import { describe, expect, it } from "vitest";
import {
  coerceMobileUiLanguage,
  isReviewedUiLanguage,
  LANGUAGE_REGISTRY,
  reviewedUiLanguageOptions,
} from "../language-registry";

describe("isReviewedUiLanguage", () => {
  it("accepts every bundled catalog", () => {
    for (const lang of LANGUAGE_REGISTRY) {
      expect(isReviewedUiLanguage(lang.code)).toBe(true);
    }
    expect(isReviewedUiLanguage("zu")).toBe(true);
    expect(isReviewedUiLanguage("af")).toBe(true);
    expect(isReviewedUiLanguage("en-GB")).toBe(true);
  });
});

describe("coerceMobileUiLanguage", () => {
  it("keeps bundled codes and maps unknown tags to English", () => {
    expect(coerceMobileUiLanguage("zu")).toBe("zu");
    expect(coerceMobileUiLanguage("af")).toBe("af");
    expect(coerceMobileUiLanguage("pt-br")).toBe("pt-BR");
    expect(coerceMobileUiLanguage("de-DE")).toBe("de");
    expect(coerceMobileUiLanguage("en-GB")).toBe("en-GB");
    expect(coerceMobileUiLanguage("xx")).toBe("en");
  });
});

describe("reviewedUiLanguageOptions", () => {
  it("lists every registry language", () => {
    expect(reviewedUiLanguageOptions().map((l) => l.code)).toEqual(
      LANGUAGE_REGISTRY.map((l) => l.code),
    );
  });
});
