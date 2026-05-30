import { describe, expect, it } from "vitest";
import {
  daysFromTodayInProviderZone,
  filterPublicSlotsByMinNotice,
  isDateBeyondMaxAdvance,
} from "@/lib/provider-booking/public-online-booking-windows";

describe("public online booking windows", () => {
  it("filters slots before min-notice cutoff", () => {
    const now = Date.now();
    const slots = [
      { start: new Date(now + 30 * 60 * 1000).toISOString(), end: "", is_available: true },
      { start: new Date(now + 3 * 60 * 60 * 1000).toISOString(), end: "", is_available: true },
    ];
    const filtered = filterPublicSlotsByMinNotice(slots, 120);
    expect(filtered).toHaveLength(1);
    expect(new Date(filtered[0]!.start).getTime()).toBeGreaterThan(now + 119 * 60 * 1000);
  });

  it("uses provider timezone for max-advance day math", () => {
    const tz = "Africa/Johannesburg";
    const today = daysFromTodayInProviderZone(
      new Date().toLocaleDateString("en-CA", { timeZone: tz }),
      tz,
    );
    expect(today).toBe(0);
    expect(isDateBeyondMaxAdvance("2099-01-01", 365, tz)).toBe(true);
  });
});
