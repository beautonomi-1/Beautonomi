import { describe, expect, it } from "vitest";
import { adminSearchResultSpaPath } from "./adminSearchSpaPaths";

describe("adminSearchResultSpaPath", () => {
  it("returns detail routes under the admin SPA basename", () => {
    expect(adminSearchResultSpaPath("user", "abc-123")).toBe("/users/abc-123");
    expect(adminSearchResultSpaPath("provider", "p1")).toBe("/providers/p1");
    expect(adminSearchResultSpaPath("booking", "BK/1")).toBe("/bookings/BK/1");
  });
});
