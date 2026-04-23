import { describe, it, expect } from "vitest";
import { buildZonedIsoForWallClock } from "../buildZonedIsoForWallClock";

describe("buildZonedIsoForWallClock", () => {
  it("produces +02:00 for SAST in January (no DST)", () => {
    const iso = buildZonedIsoForWallClock(
      "2026-01-15",
      "14:30",
      "Africa/Johannesburg",
    );
    expect(iso).toBe("2026-01-15T14:30:00+02:00");
  });

  it("produces +02:00 for SAST in July (still no DST)", () => {
    const iso = buildZonedIsoForWallClock(
      "2026-07-15",
      "09:00",
      "Africa/Johannesburg",
    );
    expect(iso).toBe("2026-07-15T09:00:00+02:00");
  });

  it("handles UTC passthrough", () => {
    const iso = buildZonedIsoForWallClock("2026-03-20", "12:00", "UTC");
    expect(iso).toBe("2026-03-20T12:00:00+00:00");
  });

  it("canonicalises legacy offset-style zones (GMT+2)", () => {
    // normalizeProviderTimezone('GMT+2') → Etc/GMT-2, which in POSIX
    // convention means "+02:00 east of UTC". The offset-probe should
    // still produce +02:00 for that zone regardless of the confusing
    // POSIX sign flip.
    const iso = buildZonedIsoForWallClock("2026-03-20", "12:00", "GMT+2");
    expect(iso.endsWith("+02:00")).toBe(true);
  });

  it("falls back to device local on null zone without throwing", () => {
    const iso = buildZonedIsoForWallClock("2026-03-20", "12:00", null);
    // We don't assert the offset (depends on the host), just the shape.
    expect(iso).toMatch(
      /^2026-03-20T12:00:00[+-]\d{2}:\d{2}$/,
    );
  });

  it("pads single-digit time components", () => {
    const iso = buildZonedIsoForWallClock("2026-05-01", "9:5", "UTC");
    expect(iso).toBe("2026-05-01T09:05:00+00:00");
  });
});
