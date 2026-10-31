import { describe, expect, it } from "vitest";
import { exploreCaptionSafetyVerdict } from "../explore-caption-denylist";
import { captionHasMedicalClaims } from "../medical-claims-keywords";

describe("exploreCaptionSafetyVerdict", () => {
  it("flags explicit sexual captions as likely_violation", () => {
    expect(exploreCaptionSafetyVerdict("Check out this nsfw content")).toBe("likely_violation");
  });

  it("flags minor-related sexual captions as likely_violation", () => {
    expect(exploreCaptionSafetyVerdict("child porn link")).toBe("likely_violation");
  });

  it("allows benign captions", () => {
    expect(exploreCaptionSafetyVerdict("Fresh balayage at our salon")).toBe("safe");
  });
});

describe("medical claims on explore captions", () => {
  it("detects medical claims without auto-hide verdict", () => {
    expect(exploreCaptionSafetyVerdict("This cream cures eczema forever")).toBe("safe");
    expect(captionHasMedicalClaims("This cream cures eczema forever")).toBe(true);
  });
});
