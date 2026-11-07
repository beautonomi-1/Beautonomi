import { describe, expect, it } from "vitest";
import af from "../locales/af.json";
import en from "../locales/en.json";
import st from "../locales/st.json";
import zu from "../locales/zu.json";

describe("ZA booking translations", () => {
  it("uses real Afrikaans for venue-step engine copy instead of English clones", () => {
    expect(af.web.book.engine.visitSalon).toBe("Besoek die salon");
    expect(af.web.book.engine.visitSalon).not.toBe(en.web.book.engine.visitSalon);
    expect(af.web.book.engine.atYourHomeTitle).toBe("By jou huis");
    expect(af.web.book.engine.noSalonLocations).toMatch(/salonliggings/i);
    expect(af.web.book.engine.venueExperienceProvider).toContain("{{providerName}}");
    expect(af.common.continue).toBe("Gaan voort");
    expect(af.web.seo.homeSrOnlyTitle).toMatch(/skoonheid/i);
  });

  it("uses real isiZulu for the same venue keys", () => {
    expect(zu.web.book.engine.visitSalon).toBe("Vakashela isaluni");
    expect(zu.web.book.engine.visitSalon).not.toBe(en.web.book.engine.visitSalon);
    expect(zu.common.continue).toBe("Qhubeka");
  });

  const retentionKeys = [
    (j: typeof en) => j.checkout.platformFee,
    (j: typeof en) => j.web.provider.onboarding.payment.bookingProtectionMoneyLine1,
    (j: typeof en) => j.web.provider.dashboard.insights.channelMixNudge,
    (j: typeof en) => j.customer.mobile.screens.partnerProfile.bookingProtectionCheckoutLine,
  ] as const;

  it("has retention UX strings in en/zu/af/st with real ZA locales", () => {
    for (const pick of retentionKeys) {
      const enVal = pick(en);
      expect(typeof enVal).toBe("string");
      expect(enVal.length).toBeGreaterThan(5);
      expect(pick(zu)).not.toBe(enVal);
      expect(pick(af)).not.toBe(enVal);
      expect(pick(st)).not.toBe(enVal);
      expect(pick(zu).length).toBeGreaterThan(5);
      expect(pick(af).length).toBeGreaterThan(5);
      expect(pick(st).length).toBeGreaterThan(5);
    }
  });
});
