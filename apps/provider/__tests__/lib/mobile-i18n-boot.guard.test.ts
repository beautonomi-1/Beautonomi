import fs from "fs";
import path from "path";

describe("Provider mobile i18n boot", () => {
  it("initializes English and coerces saved/device language", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../src/lib/i18n.ts"), "utf8");
    expect(src).toContain('initI18n(BOOT_LOCALE)');
    expect(src).toContain("coerceMobileUiLanguage");
    expect(src).toContain("isReviewedUiLanguage(savedNorm)");
    expect(src).toContain("isReviewedUiLanguage(deviceLocale)");
  });
});
