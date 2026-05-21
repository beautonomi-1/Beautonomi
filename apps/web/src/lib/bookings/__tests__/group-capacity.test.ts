import { describe, expect, it } from "vitest";
import { evaluateGroupCapacity, normalizeGroupCapacity } from "../group-capacity";

describe("group capacity", () => {
  it("normalizes empty capacity as uncapped unless a fallback is supplied", () => {
    expect(normalizeGroupCapacity(null)).toBeNull();
    expect(normalizeGroupCapacity("", 10)).toBe(10);
  });

  it("allows adding participants while under capacity", () => {
    expect(
      evaluateGroupCapacity({
        maxParticipants: 4,
        currentParticipants: 2,
        adding: 1,
      })
    ).toEqual({ ok: true, max: 4, current: 2, next: 3 });
  });

  it("rejects additions that exceed capacity", () => {
    const result = evaluateGroupCapacity({
      maxParticipants: 3,
      currentParticipants: 3,
      adding: 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("GROUP_CAPACITY_EXCEEDED");
  });

  it("allows legacy groups with no explicit max", () => {
    expect(
      evaluateGroupCapacity({
        maxParticipants: null,
        currentParticipants: 12,
        adding: 1,
      }).ok
    ).toBe(true);
  });
});
