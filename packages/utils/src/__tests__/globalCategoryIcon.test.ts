import { describe, expect, it } from "vitest";
import {
  resolveGlobalCategoryIconUri,
  resolveLegacyGlobalCategoryIconPath,
} from "../globalCategoryIcon";

describe("globalCategoryIcon", () => {
  it("maps legacy Beautonomi component names to image paths", () => {
    expect(resolveLegacyGlobalCategoryIconPath("BeautonomiNails")).toBe("/images/nail-art.svg");
    expect(resolveLegacyGlobalCategoryIconPath("BeautonomiMakeup")).toBe("/images/makeup.svg");
  });

  it("resolves legacy names to absolute URIs when web origin is provided", () => {
    const uri = resolveGlobalCategoryIconUri("BeautonomiHair", "https://app.beautonomi.com");
    expect(uri).toBe("https://app.beautonomi.com/images/icons8-hair-dryer-80.svg?cic_rev=20260414b");
  });

  it("resolves root-relative paths with origin", () => {
    const uri = resolveGlobalCategoryIconUri("/images/braids.svg", "https://app.beautonomi.com");
    expect(uri).toContain("https://app.beautonomi.com/images/braids.svg");
  });

  it("returns null when origin is missing for path icons", () => {
    expect(resolveGlobalCategoryIconUri("/images/braids.svg", "")).toBeNull();
  });
});
