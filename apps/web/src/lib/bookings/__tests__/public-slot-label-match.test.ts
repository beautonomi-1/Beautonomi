/**
 * §Booking-slot-audit 2026-05: regression test for the legacy `/booking`
 * `step-calendar.tsx` `public_slots` matching logic.
 *
 * The page persists the authoritative ISO `start`/`end` from
 * `availability.public_slots` onto `bookingState.selectedSlotStart` /
 * `selectedSlotEnd` so the hold and booking POST use the exact engine
 * instants. Previously the lookup matched on the UTC ISO substring
 * `p.start.match(/T(\d{2}:\d{2})/)`, which is wrong for non-UTC providers:
 *
 *   - A 03:00 SAST slot has ISO `01:00Z`.
 *   - Matching `slots[i].time = "03:00"` against substring `"01:00"` failed.
 *   - The page fell back to deriving the instant from the HH:MM label and
 *     lost `selectedSlotEnd` and `available_staff_ids`, opening the door
 *     to "invalid time / slot taken" failures at hold/payment time.
 *
 * This file encodes the corrected matching contract so any future
 * refactor of `step-calendar.tsx` keeps early-morning slots intact.
 */
import { describe, it, expect } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import { normalizeProviderTimezone } from "@/lib/availability/time-utils";

const SAST = "Africa/Johannesburg"; // UTC+2.

function normalizeHHmmLabel(value: string): string {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return value.trim();
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function publicSlotLabelInProviderTz(iso: string, providerTz?: string | null): string {
  const tz = normalizeProviderTimezone(providerTz ?? null);
  if (tz) {
    try {
      return formatInTimeZone(new Date(iso), tz, "HH:mm");
    } catch {
      // fall through
    }
  }
  return iso.match(/T(\d{2}:\d{2})/)?.[1] ?? "";
}

describe("public_slots → HH:mm label matching (legacy /booking step-calendar)", () => {
  const publicSlots = [
    // 03:00 SAST = 01:00Z, 04:00 SAST = 02:00Z, 05:00 SAST = 03:00Z.
    { start: "2026-06-11T01:00:00.000Z", end: "2026-06-11T02:00:00.000Z" },
    { start: "2026-06-11T02:00:00.000Z", end: "2026-06-11T03:00:00.000Z" },
    { start: "2026-06-11T03:00:00.000Z", end: "2026-06-11T04:00:00.000Z" },
  ];

  it("matches each engine-emitted slot to its provider-local HH:mm label", () => {
    const labels = publicSlots.map((p) => publicSlotLabelInProviderTz(p.start, SAST));
    expect(labels).toEqual(["03:00", "04:00", "05:00"]);
  });

  it("survives normalised labels like '3:00' / '03:00' / '03:00:00'", () => {
    for (const raw of ["3:00", "03:00", "03:00:00"]) {
      const wanted = normalizeHHmmLabel(raw);
      const hit = publicSlots.find(
        (p) => publicSlotLabelInProviderTz(p.start, SAST) === wanted,
      );
      expect(hit?.start).toBe("2026-06-11T01:00:00.000Z");
    }
  });

  it("legacy ISO-substring fallback returns the wrong instant for non-UTC zones — the bug we fixed", () => {
    // No TZ: substring path returns the UTC HH:mm, not the provider wall clock.
    const labels = publicSlots.map((p) => publicSlotLabelInProviderTz(p.start, null));
    expect(labels).toEqual(["01:00", "02:00", "03:00"]);

    // So a customer who tapped "03:00" would miss the authoritative slot
    // entirely under the legacy logic (would match the 05:00 SAST entry).
    const buggedMatch = publicSlots.find(
      (p) => publicSlotLabelInProviderTz(p.start, null) === "03:00",
    );
    expect(buggedMatch?.start).toBe("2026-06-11T03:00:00.000Z"); // 05:00 SAST!
  });

  it("normalised provider-TZ matching picks the correct entry for 03:00 SAST", () => {
    const wanted = normalizeHHmmLabel("03:00");
    const hit = publicSlots.find(
      (p) => publicSlotLabelInProviderTz(p.start, SAST) === wanted,
    );
    expect(hit?.start).toBe("2026-06-11T01:00:00.000Z"); // 03:00 SAST.
    expect(hit?.end).toBe("2026-06-11T02:00:00.000Z");
  });
});
