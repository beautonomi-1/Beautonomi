import { afterEach, describe, expect, it } from "vitest";
import { i18n, initI18n } from "../index";

describe("initI18n", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("does not reset a live language when called again with a stale default", async () => {
    const inst = initI18n("en");
    await inst.changeLanguage("af");
    expect(normalizeLive(inst.language)).toBe("af");
    initI18n("en");
    expect(normalizeLive(inst.language)).toBe("af");
  });

  it("resolves bundled English keys after init (not raw key paths)", () => {
    const inst = initI18n("en");
    expect(inst.t("common.appLanguage")).toBe("App language");
  });
});

function normalizeLive(language: string): string {
  return language.split("-")[0] ?? language;
}
