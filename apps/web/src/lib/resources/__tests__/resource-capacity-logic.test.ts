/**
 * Unit tests for resource capacity logic.
 *
 * The TS `checkResourceAvailability` function is database-bound, so we test
 * the decision logic that it implements inline rather than mocking the whole
 * Supabase client.
 *
 * Rule being tested (matches the canonical DB filter in migration 475's
 * `lock_booking_resources_for_update` and the TS `checkResourceAvailability`):
 *   - concurrent active bookings (status NOT IN cancelled/no_show) < capacity → available
 *   - concurrent active bookings >= capacity → conflict
 *
 * NOTE: the `booking_status` enum is
 * (pending, confirmed, in_progress, completed, cancelled, no_show, waiting,
 * checked_in) — it has NO `failed` value, so only cancelled + no_show free a slot.
 */

import { describe, it, expect } from "vitest";

// ─── Inline the capacity gate logic for deterministic testing ────────────────

function isResourceAvailable(capacity: number, concurrentActiveCount: number): boolean {
  return concurrentActiveCount < capacity;
}

// Canonical non-occupying statuses (migration 475). 'failed' is intentionally
// absent because it is not a valid booking_status enum value.
const NON_OCCUPYING_STATUSES = new Set(["cancelled", "no_show"]);

function countActiveBookings(
  bookings: Array<{ status: string; exclude?: boolean }>,
): number {
  return bookings.filter((b) => !b.exclude && !NON_OCCUPYING_STATUSES.has(b.status)).length;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("resource capacity gate: isResourceAvailable()", () => {
  it("capacity=1: allows first booking (0 concurrent)", () => {
    expect(isResourceAvailable(1, 0)).toBe(true);
  });

  it("capacity=1: rejects second booking (1 concurrent)", () => {
    expect(isResourceAvailable(1, 1)).toBe(false);
  });

  it("capacity=2: allows first and second booking", () => {
    expect(isResourceAvailable(2, 0)).toBe(true);
    expect(isResourceAvailable(2, 1)).toBe(true);
  });

  it("capacity=2: rejects third booking (2 concurrent)", () => {
    expect(isResourceAvailable(2, 2)).toBe(false);
  });

  it("capacity=0: always rejects (degenerate case)", () => {
    expect(isResourceAvailable(0, 0)).toBe(false);
  });

  it("capacity=10: allows up to 9 concurrent, rejects at 10", () => {
    expect(isResourceAvailable(10, 9)).toBe(true);
    expect(isResourceAvailable(10, 10)).toBe(false);
  });
});

describe("resource capacity gate: countActiveBookings()", () => {
  it("counts confirmed/pending bookings", () => {
    const bookings = [
      { status: "confirmed" },
      { status: "pending" },
    ];
    expect(countActiveBookings(bookings)).toBe(2);
  });

  it("excludes cancelled bookings", () => {
    const bookings = [
      { status: "confirmed" },
      { status: "cancelled" },
    ];
    expect(countActiveBookings(bookings)).toBe(1);
  });

  it("excludes no_show bookings", () => {
    const bookings = [
      { status: "confirmed" },
      { status: "no_show" },
    ];
    expect(countActiveBookings(bookings)).toBe(1);
  });

  it("counts completed/in_progress/waiting/checked_in as occupying", () => {
    const bookings = [
      { status: "completed" },
      { status: "in_progress" },
      { status: "waiting" },
      { status: "checked_in" },
      { status: "pending" },
    ];
    expect(countActiveBookings(bookings)).toBe(5);
  });

  it("excludes the booking being rescheduled when marked", () => {
    const bookings = [
      { status: "confirmed" },
      { status: "confirmed", exclude: true }, // current booking being edited
    ];
    expect(countActiveBookings(bookings)).toBe(1);
  });

  it("returns 0 when all bookings are cancelled/no_show", () => {
    const bookings = [
      { status: "cancelled" },
      { status: "no_show" },
      { status: "cancelled" },
    ];
    expect(countActiveBookings(bookings)).toBe(0);
  });
});

describe("resource capacity gate: combined scenarios", () => {
  it("capacity=1 allows slot when only cancelled bookings overlap", () => {
    const bookings = [{ status: "cancelled" }];
    const active = countActiveBookings(bookings);
    expect(isResourceAvailable(1, active)).toBe(true);
  });

  it("capacity=2 rejects slot when 2 confirmed bookings overlap", () => {
    const bookings = [{ status: "confirmed" }, { status: "confirmed" }];
    const active = countActiveBookings(bookings);
    expect(isResourceAvailable(2, active)).toBe(false);
  });

  it("capacity=2 allows slot when 1 confirmed + 1 cancelled overlap", () => {
    const bookings = [{ status: "confirmed" }, { status: "cancelled" }];
    const active = countActiveBookings(bookings);
    expect(isResourceAvailable(2, active)).toBe(true);
  });

  it("capacity=3 allows slot when 2 confirmed + 1 no_show overlap (2 active < 3)", () => {
    const bookings = [
      { status: "confirmed" },
      { status: "confirmed" },
      { status: "no_show" },
    ];
    const active = countActiveBookings(bookings);
    expect(isResourceAvailable(3, active)).toBe(true);
  });

  it("capacity=2 rejects slot when 2 completed bookings overlap (completed occupies)", () => {
    const bookings = [{ status: "completed" }, { status: "completed" }];
    const active = countActiveBookings(bookings);
    expect(isResourceAvailable(2, active)).toBe(false);
  });
});
