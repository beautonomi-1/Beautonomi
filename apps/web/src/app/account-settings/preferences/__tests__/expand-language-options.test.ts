import { describe, expect, it } from "vitest";
import { expandLanguagePreferenceOptions } from "../expand-language-options";

describe("expandLanguagePreferenceOptions", () => {
  it("includes Wave B languages even when the market list is English-only", () => {
    const rows = expandLanguagePreferenceOptions(
      [{ id: "1", type: "language", code: "en", name: "English", display_order: 1 }],
      ["en"],
    );
    expect(rows.some((r) => r.code === "de")).toBe(true);
    expect(rows.some((r) => r.code === "nl")).toBe(true);
    expect(rows.some((r) => r.code === "af")).toBe(true);
  });
});
