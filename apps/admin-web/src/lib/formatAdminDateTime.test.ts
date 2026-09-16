import { describe, expect, it } from "vitest";
import { formatAdminRelativeTime } from "./formatAdminDateTime";

describe("formatAdminRelativeTime", () => {
  it("returns just now for recent timestamps", () => {
    const iso = new Date(Date.now() - 5_000).toISOString();
    expect(formatAdminRelativeTime(iso)).toBe("just now");
  });
});
