const en = require("../../../../packages/i18n/src/locales/en.json");
const af = require("../../../../packages/i18n/src/locales/af.json");
const zu = require("../../../../packages/i18n/src/locales/zu.json");
const st = require("../../../../packages/i18n/src/locales/st.json");

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

function readPath(root: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, root);
}

describe("calendar i18n coverage", () => {
  const locales = { af, zu, st };
  const englishCalendar = en.provider.calendarScreen;

  it("keeps provider calendar keys aligned across supported locales", () => {
    const expected = flattenKeys(englishCalendar).sort();
    for (const [locale, bundle] of Object.entries(locales)) {
      expect(flattenKeys(bundle.provider.calendarScreen).sort()).toEqual(expected);
    }
  });

  it("localizes high-traffic Zulu and Sesotho calendar copy instead of leaving English placeholders", () => {
    const highTrafficKeys = [
      "dateNav.today",
      "fetchError.retry",
      "preferencesModal.title",
      "preferencesModal.highContrast",
      "actionRail.newLabel",
      "actionRail.waitingLabel",
      "overlayMenu.delete",
      "colorLegend.title",
      "staleDataBanner.body",
      "grid.emptyDayHint",
    ];

    for (const locale of [zu, st]) {
      for (const key of highTrafficKeys) {
        expect(readPath(locale.provider.calendarScreen, key)).not.toEqual(
          readPath(englishCalendar, key),
        );
      }
    }
  });
});
