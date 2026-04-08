import { describe, it, expect } from "vitest";
import {
  flattenProviderServicesToMenu,
  resolvePackageOfferingsFromFlatMenu,
} from "./resolvePackageOfferingsFromFlatMenu";

const ZAR = "ZAR";

describe("resolvePackageOfferingsFromFlatMenu", () => {
  const flat = [
    {
      id: "base-hair",
      title: "Haircut",
      duration_minutes: 30,
      price: 100,
      currency: ZAR,
      buffer_minutes: 5,
      variants: [
        { id: "var-a", title: "Haircut — Senior", duration_minutes: 45, price: 150, buffer_minutes: 10 },
      ],
    },
    {
      id: "single",
      title: "Single",
      duration_minutes: 20,
      price: 50,
      currency: ZAR,
    },
  ];

  it("resolves variant id before base id", () => {
    const r = resolvePackageOfferingsFromFlatMenu(["var-a"], flat, ZAR, "strict");
    expect(r).not.toBeNull();
    expect(r![0].offeringId).toBe("var-a");
    expect(r![0].duration_minutes).toBe(45);
  });

  it("strict mode returns null when an id is unknown", () => {
    expect(resolvePackageOfferingsFromFlatMenu(["nope"], flat, ZAR, "strict")).toBeNull();
  });

  it("skip mode omits unknown ids", () => {
    const r = resolvePackageOfferingsFromFlatMenu(["nope", "single"], flat, ZAR, "skip");
    expect(r).not.toBeNull();
    expect(r!.map((x) => x.offeringId)).toEqual(["single"]);
  });

  it("flattenProviderServicesToMenu flattens categories", () => {
    const menu = flattenProviderServicesToMenu([{ services: [{ id: "a" }] }, { services: [{ id: "b" }] }]);
    expect(menu.map((m) => m.id)).toEqual(["a", "b"]);
  });
});
