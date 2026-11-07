import { describe, expect, it } from "vitest";
import { publicSuggestionPlaceLabel } from "./publicSuggestionPlaceLabel";

describe("publicSuggestionPlaceLabel", () => {
  it("shows neighborhood and metro when both differ", () => {
    expect(publicSuggestionPlaceLabel("Sandton", "Bryanston", "Johannesburg")).toBe(
      "Bryanston, Johannesburg",
    );
  });

  it("shows city and metro when no neighborhood", () => {
    expect(publicSuggestionPlaceLabel("Sandton", null, "Johannesburg")).toBe(
      "Sandton, Johannesburg",
    );
  });

  it("shows city only when neighborhood equals metro", () => {
    expect(publicSuggestionPlaceLabel("Johannesburg", "Johannesburg", "Johannesburg")).toBe(
      "Johannesburg",
    );
  });

  it("returns undefined when all empty", () => {
    expect(publicSuggestionPlaceLabel("", null, undefined)).toBeUndefined();
  });
});
