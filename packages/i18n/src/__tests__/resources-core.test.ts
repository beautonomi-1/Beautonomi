import { describe, expect, it } from "vitest";
import { CORE_LOCALE_CODES, resources } from "../resources-core";

describe("resources-core", () => {
  it("only inlines English and regional English overlays", () => {
    expect(Object.keys(resources).sort()).toEqual([...CORE_LOCALE_CODES].sort());
    expect(resources).not.toHaveProperty("fr");
    expect(resources).not.toHaveProperty("ar");
    expect(resources).not.toHaveProperty("zu");
  });
});

