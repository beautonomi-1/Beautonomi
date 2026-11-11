import { describe, expect, it } from "vitest";
import { ageBandForLocks, bandFromAge } from "../age-band";

describe("ageBandForLocks (F3-25)", () => {
  it("keeps verified 18_plus so KYC can unlock adult settings", () => {
    expect(ageBandForLocks({ band: "18_plus", source: "verified_dob" })).toBe("18_plus");
  });

  it("does not let a self-declared adult DOB lift 18+ locks", () => {
    expect(ageBandForLocks({ band: "18_plus", source: "declared_dob" })).toBe("unknown");
  });

  it("still applies declared under-18 bands (tightens, never lifts)", () => {
    expect(ageBandForLocks({ band: "13_17", source: "declared_dob" })).toBe("13_17");
    expect(ageBandForLocks({ band: "under_13", source: "declared_dob" })).toBe("under_13");
  });

  it("keeps under_age_flag, device, and unknown sources as resolved", () => {
    expect(ageBandForLocks({ band: "under_13", source: "under_age_flag" })).toBe("under_13");
    expect(ageBandForLocks({ band: "18_plus", source: "device_signal" })).toBe("18_plus");
    expect(ageBandForLocks({ band: "unknown", source: "none" })).toBe("unknown");
  });

  it("bandFromAge still reports 18_plus for display of a declared adult age", () => {
    expect(bandFromAge(21)).toBe("18_plus");
  });
});
