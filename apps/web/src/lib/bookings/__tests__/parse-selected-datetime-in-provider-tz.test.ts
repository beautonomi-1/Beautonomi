import { describe, it, expect } from "vitest";
import { parseSelectedDatetimeInProviderTz } from "../parse-selected-datetime-in-provider-tz";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";

describe("parseSelectedDatetimeInProviderTz", () => {
  it("interprets wall time in provider TZ (SAST +2): 03:00 local → correct UTC instant", () => {
    const d = parseSelectedDatetimeInProviderTz("2026-06-10", "03:00", "Africa/Johannesburg");
    expect(d.toISOString()).toBe("2026-06-10T01:00:00.000Z");
  });

  it("uses DEFAULT_BOOKING_DISPLAY_TIMEZONE when provider TZ is missing", () => {
    const d = parseSelectedDatetimeInProviderTz("2026-06-10", "03:00", null);
    const withDefault = parseSelectedDatetimeInProviderTz("2026-06-10", "03:00", "");
    expect(d.toISOString()).toBe(withDefault.toISOString());
    expect(DEFAULT_BOOKING_DISPLAY_TIMEZONE).toBeTruthy();
  });

  it("accepts HH:mm:ss time strings", () => {
    const d = parseSelectedDatetimeInProviderTz("2026-06-10", "03:00:00", "Africa/Johannesburg");
    expect(d.toISOString()).toBe("2026-06-10T01:00:00.000Z");
  });
});
