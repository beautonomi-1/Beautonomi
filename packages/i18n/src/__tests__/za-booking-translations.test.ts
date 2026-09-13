import { describe, expect, it } from "vitest";
import af from "../locales/af.json";
import en from "../locales/en.json";
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
});
