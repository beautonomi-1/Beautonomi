import { describe, expect, it } from "vitest";
import { parseAudienceDefinition } from "../audience";

describe("parseAudienceDefinition", () => {
  it("maps legacy JSON shapes", () => {
    const a = parseAudienceDefinition({
      segment: "provider",
      personas: ["Salon owner"],
      cities: ["Johannesburg"],
      age_bands: ["25-34"],
    });
    expect(a.segment).toBe("provider");
    expect(a.personas).toEqual(["Salon owner"]);
  });

  it("defaults empty input", () => {
    const a = parseAudienceDefinition(null);
    expect(a.segment).toBe("customer");
    expect(a.lifecycle).toBe("all");
  });
});
