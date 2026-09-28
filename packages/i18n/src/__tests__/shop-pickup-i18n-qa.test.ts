import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import af from "../locales/af.json";
import ar from "../locales/ar.json";
import fr from "../locales/fr.json";
import zu from "../locales/zu.json";

const enHours = en.customer.mobile.tabs.shop.locationHours;
const enReady = en.provider.mobile.components.bookingCreateReadiness;

function assertNoEnglishCalque(enVal: string, locVal: string) {
  expect(locVal).not.toBe(enVal);
  expect(/not listed/i.test(locVal)).toBe(false);
  expect(/\bchecklist\b/i.test(locVal)).toBe(false);
}

describe("shop pickup i18n QA", () => {
  it("resolves locationHours without English calques in fr, zu, ar", () => {
    assertNoEnglishCalque(enHours.notListed, fr.customer.mobile.tabs.shop.locationHours.notListed);
    assertNoEnglishCalque(enHours.openUntil, fr.customer.mobile.tabs.shop.locationHours.openUntil);
    assertNoEnglishCalque(enHours.notListed, zu.customer.mobile.tabs.shop.locationHours.notListed);
    assertNoEnglishCalque(enHours.openUntil, zu.customer.mobile.tabs.shop.locationHours.openUntil);
    assertNoEnglishCalque(enHours.notListed, ar.customer.mobile.tabs.shop.locationHours.notListed);
    expect(ar.customer.mobile.tabs.shop.locationHours.openUntil).toContain("{{time}}");
  });

  it("uses localized booking readiness titles", () => {
    assertNoEnglishCalque(enReady.title, fr.provider.mobile.components.bookingCreateReadiness.title);
    assertNoEnglishCalque(enReady.title, zu.provider.mobile.components.bookingCreateReadiness.title);
    assertNoEnglishCalque(enReady.title, ar.provider.mobile.components.bookingCreateReadiness.title);
    expect(fr.web.provider.bookings.createReadiness.title).toBe(
      fr.provider.mobile.components.bookingCreateReadiness.title,
    );
  });

  it("keeps Afrikaans shop pickup strings factual", () => {
    expect(af.customer.mobile.tabs.shop.locationHours.notListed).toMatch(/nie gelys/i);
    expect(af.customer.mobile.tabs.shop.pickupStore.directions).toBe("Aanwysings");
    expect(af.provider.mobile.components.bookingCreateReadiness.title).toMatch(/checklys/i);
  });
});
