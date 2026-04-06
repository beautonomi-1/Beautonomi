import { describe, expect, it } from "vitest";
import { adminSearchResultLegacyPath } from "./adminSearchResultLegacyPath";

describe("adminSearchResultLegacyPath", () => {
  it("builds user highlight URL", () => {
    expect(adminSearchResultLegacyPath("user", "abc-123")).toBe("/admin/users?highlight=abc-123");
  });

  it("encodes special characters", () => {
    expect(adminSearchResultLegacyPath("booking", "BK/1")).toContain("highlight=");
    expect(adminSearchResultLegacyPath("booking", "BK/1")).toMatch(/highlight=BK%2F1/);
  });

  it("builds provider highlight URL", () => {
    expect(adminSearchResultLegacyPath("provider", "p1")).toBe("/admin/providers?highlight=p1");
  });
});
