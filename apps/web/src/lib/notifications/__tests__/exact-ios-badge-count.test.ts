import { describe, expect, it } from "vitest";
import { exactIosBadgeCount } from "@/lib/notifications/exact-ios-badge-count";

describe("exactIosBadgeCount", () => {
  it("returns 0 for zero unread (mark-all-read)", () => {
    expect(exactIosBadgeCount(0)).toBe(0);
  });

  it("clamps negatives and non-finite values", () => {
    expect(exactIosBadgeCount(-3)).toBe(0);
    expect(exactIosBadgeCount(Number.NaN)).toBe(0);
  });

  it("floors and caps large counts", () => {
    expect(exactIosBadgeCount(3.9)).toBe(3);
    expect(exactIosBadgeCount(1_000_000)).toBe(999_999);
  });
});
