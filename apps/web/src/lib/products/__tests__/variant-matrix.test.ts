import { describe, expect, it } from "vitest";
import { generateVariantMatrixRows } from "@/lib/products/variant-matrix";

describe("generateVariantMatrixRows", () => {
  it("builds cartesian combinations for multiple option types", () => {
    const rows = generateVariantMatrixRows(
      [
        { name: "Size", values: ["S", "M"] },
        { name: "Scent", values: ["Rose"] },
      ],
      [],
      { measure: "ml" },
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.option_values)).toEqual(
      expect.arrayContaining([
        { Size: "S", Scent: "Rose" },
        { Size: "M", Scent: "Rose" },
      ]),
    );
  });
});
