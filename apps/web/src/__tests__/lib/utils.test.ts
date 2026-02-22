import { describe, it, expect } from "vitest";
import { cn, formatCurrency, formatDate, formatTime } from "@/lib/utils";

describe("cn (class name merge)", () => {
  it("merges class strings", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2");
  });

  it("resolves tailwind conflicts", () => {
    const result = cn("px-4", "px-8");
    expect(result).toBe("px-8");
  });

  it("handles conditional classes", () => {
    const result = cn("base", false && "hidden", "extra");
    expect(result).toBe("base extra");
  });
});

describe("formatCurrency", () => {
  it("formats ZAR by default", () => {
    const result = formatCurrency(100);
    expect(result).toContain("100");
    expect(result).toMatch(/R|ZAR/);
  });

  it("handles zero amount", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0");
  });

  it("formats with two decimal places", () => {
    const result = formatCurrency(49.9);
    // en-ZA locale uses comma as decimal separator
    expect(result).toMatch(/49[.,]90/);
  });

  it("respects currency parameter", () => {
    const result = formatCurrency(100, "USD");
    expect(result).toMatch(/\$|USD/);
  });
});

describe("formatDate", () => {
  it("formats Date object", () => {
    const result = formatDate(new Date(2026, 2, 15));
    expect(result).toContain("March");
    expect(result).toContain("15");
    expect(result).toContain("2026");
  });

  it("formats ISO date string", () => {
    const result = formatDate("2026-06-01T00:00:00Z");
    expect(result).toContain("2026");
  });

  it("includes weekday", () => {
    const result = formatDate(new Date(2026, 0, 5));
    expect(result).toContain("Monday");
  });
});

describe("formatTime", () => {
  it("formats 24h time string to 12h", () => {
    expect(formatTime("14:30")).toBe("2:30 PM");
    expect(formatTime("09:00")).toBe("9:00 AM");
  });

  it("handles midnight", () => {
    expect(formatTime("00:00")).toBe("12:00 AM");
  });

  it("handles noon", () => {
    expect(formatTime("12:00")).toBe("12:00 PM");
  });

  it("formats ISO date string", () => {
    const result = formatTime("2026-03-15T14:30:00Z");
    expect(result).toMatch(/\d{1,2}:\d{2} (AM|PM)/);
  });
});
