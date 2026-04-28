import { describe, it, expect } from "vitest";
import { normalizeWorkingHours } from "../normalize-working-hours";

describe("normalizeWorkingHours", () => {
  it("returns null for null/undefined input", () => {
    expect(normalizeWorkingHours(null)).toBeNull();
    expect(normalizeWorkingHours(undefined)).toBeNull();
  });

  it("normalizes Format A without inventing missing days", () => {
    const formatA = {
      monday: { is_open: true, open_time: "09:00", close_time: "17:00" },
      tuesday: { is_open: false, open_time: "09:00", close_time: "17:00" },
    };
    const result = normalizeWorkingHours(formatA);
    expect(result).toEqual({
      monday: { is_open: true, open_time: "09:00", close_time: "17:00" },
      tuesday: { is_open: false, open_time: "09:00", close_time: "17:00" },
    });
  });

  it("converts Format B to Format A without padding the week", () => {
    const formatB = {
      monday: { open: "08:00", close: "16:00", closed: false },
      wednesday: { open: "10:00", close: "20:00", closed: false },
      sunday: { closed: true },
    };
    const result = normalizeWorkingHours(formatB);
    expect(result).toEqual({
      sunday: { is_open: false, open_time: "00:00", close_time: "00:00" },
      monday: { is_open: true, open_time: "08:00", close_time: "16:00" },
      wednesday: { is_open: true, open_time: "10:00", close_time: "20:00" },
    });
  });

  it("preserves breaks", () => {
    const input = {
      monday: {
        open: "09:00",
        close: "18:00",
        closed: false,
        breaks: [{ start: "12:00", end: "13:00" }],
      },
    };
    const result = normalizeWorkingHours(input);
    expect(result!.monday.breaks).toEqual([{ start: "12:00", end: "13:00" }]);
  });

  it("ignores non-day keys without adding default days", () => {
    const input = {
      monday: { is_open: true, open_time: "09:00", close_time: "17:00" },
      foo: { is_open: true, open_time: "09:00", close_time: "17:00" },
    };
    const result = normalizeWorkingHours(input);
    expect(result).toEqual({
      monday: { is_open: true, open_time: "09:00", close_time: "17:00" },
    });
  });

  it("returns null for empty object", () => {
    expect(normalizeWorkingHours({})).toBeNull();
  });
});
