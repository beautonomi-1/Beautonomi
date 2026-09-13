import { describe, expect, it } from "vitest";
import {
  buildFormatLocale,
  getLanguageDirection,
  languagesForMarket,
  mergeLanguagePickerOptions,
  normalizeLanguageCode,
  preferredLanguageFromDevice,
  resolveLanguage,
  supportedLanguages,
} from "../language-registry";
import { buildLocaleContext } from "../locale-context";

describe("language-registry", () => {
  it("normalizes BCP-47 tags to registry codes", () => {
    expect(normalizeLanguageCode("en-GB")).toBe("en-GB");
    expect(normalizeLanguageCode("pt_BR")).toBe("pt-BR");
    expect(normalizeLanguageCode("xx")).toBe("en");
  });

  it("accepts any bundled language; market list is only the empty-input fallback", () => {
    expect(resolveLanguage("fr", ["en", "fr"])).toBe("fr");
    expect(resolveLanguage("de", ["en", "fr"])).toBe("de");
    expect(resolveLanguage(null, ["ar", "en"])).toBe("ar");
    expect(resolveLanguage("af", [])).toBe("af");
    expect(resolveLanguage("zz", ["ar", "en"])).toBe("ar");
  });

  it("maps a tourist device locale onto a bundled language", () => {
    expect(preferredLanguageFromDevice("de-DE")).toBe("de");
    expect(preferredLanguageFromDevice("nl")).toBe("nl");
    expect(preferredLanguageFromDevice("zh-CN")).toBe("en");
  });

  it("builds format locale from language + region", () => {
    expect(buildFormatLocale("fr", "FR")).toBe("fr-FR");
    expect(buildFormatLocale("ar", "AE")).toBe("ar-AE");
    expect(buildFormatLocale("en", "ZA")).toBe("en-ZA");
    expect(buildFormatLocale("en", undefined)).toBe("en-ZA");
  });

  it("preserves overlay locale region in format locale", () => {
    expect(buildFormatLocale("en-GB", "ZA")).toBe("en-GB");
    expect(buildFormatLocale("pt-BR", "BR")).toBe("pt-BR");
    expect(buildFormatLocale("es-MX", "MX")).toBe("es-MX");
  });

  it("marks Arabic as RTL", () => {
    expect(getLanguageDirection("ar")).toBe("rtl");
    expect(getLanguageDirection("en")).toBe("ltr");
  });

  it("keeps Wave B in the registry; market suggestions stay Wave A until allowlisted", () => {
    expect(supportedLanguages.some((l) => l.code === "de")).toBe(true);
    expect(languagesForMarket([]).some((l) => l.code === "de")).toBe(false);
    expect(languagesForMarket(["en", "de"]).some((l) => l.code === "de")).toBe(true);
    expect(languagesForMarket([]).every((l) => l.wave === "A")).toBe(true);
  });

  it("keeps an active language in locale context even if the market list is English-only", () => {
    const ctx = buildLocaleContext({
      language: "af",
      regionCode: "ZA",
      chargeCurrency: "ZAR",
      timezone: "Africa/Johannesburg",
      marketSupportedLanguages: ["en"],
    });
    expect(ctx.language).toBe("af");
    expect(ctx.marketSupportedLanguages).toEqual(["en"]);
  });

  it("mergeLanguagePickerOptions merges CMS rows with bundled locales", () => {
    const merged = mergeLanguagePickerOptions([{ code: "en", name: "English (CMS)" }]);
    expect(merged.some((r) => r.code === "en")).toBe(true);
    expect(merged.some((r) => r.code === "fr")).toBe(true);
    expect(merged.find((r) => r.code === "en")?.name).toContain("English");
  });
});
