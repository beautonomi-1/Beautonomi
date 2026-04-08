import { describe, it, expect } from "vitest";
import { buildSelectedServicesFromPackageLines } from "./prefillPackageFromLines";

const catalog = [
  {
    id: "off-1",
    title: "Cut",
    duration: 30,
    bufferMinutes: 5,
    price: 200,
    currency: "ZAR",
    category: "Hair",
  },
  {
    id: "off-2",
    title: "Color",
    duration: 60,
    price: 400,
    currency: "ZAR",
    category: "Hair",
  },
];

describe("buildSelectedServicesFromPackageLines", () => {
  it("returns null for empty package lines", () => {
    expect(buildSelectedServicesFromPackageLines([], catalog)).toBeNull();
    expect(buildSelectedServicesFromPackageLines(undefined, catalog)).toBeNull();
  });

  it("maps package service lines to booking rows with staffId any", () => {
    const rows = buildSelectedServicesFromPackageLines(
      [
        { id: "off-1", type: "service" },
        { id: "off-2", type: "service" },
      ],
      catalog
    );
    expect(rows).not.toBeNull();
    expect(rows!.map((r) => r.id)).toEqual(["off-1", "off-2"]);
    expect(rows!.every((r) => r.staffId === "any")).toBe(true);
    expect(rows![0].bufferMinutes).toBe(5);
  });

  it("skips non-service lines", () => {
    const rows = buildSelectedServicesFromPackageLines(
      [
        { id: "off-1", type: "service" },
        { id: "prod-x", type: "product" },
      ],
      catalog
    );
    expect(rows?.length).toBe(1);
    expect(rows![0].id).toBe("off-1");
  });

  it("returns null if any offering id is missing from catalog", () => {
    expect(
      buildSelectedServicesFromPackageLines([{ id: "missing", type: "service" }], catalog)
    ).toBeNull();
  });
});
