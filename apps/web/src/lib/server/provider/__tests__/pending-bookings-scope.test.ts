import { describe, expect, it } from "vitest";

import {
  applyPendingBookingsScope,
  applyPendingGroupsScope,
  classifyPendingBookingVisibility,
  PENDING_REVIEW_DB_STATUSES,
} from "@/lib/server/provider/pending-bookings-scope";

function makeQuery() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const chain: any = {
    in: (...args: unknown[]) => {
      calls.push({ method: "in", args });
      return chain;
    },
    is: (...args: unknown[]) => {
      calls.push({ method: "is", args });
      return chain;
    },
    or: (...args: unknown[]) => {
      calls.push({ method: "or", args });
      return chain;
    },
    calls,
  };
  return chain;
}

describe("pending-bookings-scope", () => {
  it("scopes standalone pending bookings and excludes group children", () => {
    const q = makeQuery();
    applyPendingBookingsScope(q, "loc-1");
    expect(q.calls).toEqual(
      expect.arrayContaining([
        { method: "in", args: ["status", [...PENDING_REVIEW_DB_STATUSES]] },
        { method: "is", args: ["group_booking_id", null] },
        { method: "or", args: [expect.stringContaining("loc-1")] },
      ]),
    );
  });

  it("scopes pending group parents", () => {
    const q = makeQuery();
    applyPendingGroupsScope(q, "loc-1");
    expect(q.calls).toEqual(
      expect.arrayContaining([
        { method: "in", args: ["status", ["pending"]] },
        { method: "or", args: [expect.stringContaining("loc-1")] },
      ]),
    );
  });

  it("classifies group children as hidden from nav but visible via parent when aligned", () => {
    const child = classifyPendingBookingVisibility({
      booking: {
        id: "b1",
        status: "pending",
        group_booking_id: "g1",
      },
      groupBooking: {
        id: "g1",
        status: "pending",
        location_id: "loc-1",
      },
      locationId: "loc-1",
    });
    expect(child.list_visibility).toBe("visible");
    expect(child.would_count_in_nav).toBe(false);
    expect(child.would_show_in_list).toBe(true);
  });

  it("classifies group children with parent status mismatch", () => {
    const child = classifyPendingBookingVisibility({
      booking: {
        id: "b1",
        status: "pending",
        group_booking_id: "g1",
      },
      groupBooking: {
        id: "g1",
        status: "confirmed",
        location_id: "loc-1",
      },
      locationId: "loc-1",
    });
    expect(child.list_visibility).toBe("group_parent_status_mismatch");
    expect(child.would_show_in_list).toBe(false);
    expect(child.would_count_in_nav).toBe(false);
  });
});
