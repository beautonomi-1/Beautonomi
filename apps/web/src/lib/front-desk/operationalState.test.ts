/**
 * Unit tests for Front Desk operational state
 */

import { describe, it, expect } from "vitest";
import {
  getOperationalBadge,
  matchesQueueTab,
  getQueueCounts,
} from "./operationalState";
import type { Booking } from "@/types/beautonomi";

function baseBooking(overrides: Partial<Booking> & Record<string, unknown> = {}): Booking {
  const now = new Date();
  return {
    id: "test-id",
    booking_number: "BK0001",
    customer_id: "cust-1",
    provider_id: "prov-1",
    status: "confirmed",
    location_type: "at_salon",
    location_id: "loc-1",
    address: null,
    scheduled_at: now.toISOString(),
    completed_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    services: [],
    addons: [],
    package_id: null,
    subtotal: 100,
    tip_amount: 0,
    total_amount: 100,
    currency: "ZAR",
    payment_status: "pending",
    payment_method: null,
    special_requests: null,
    loyalty_points_earned: 0,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides,
  } as Booking;
}

describe("getOperationalBadge", () => {
  it("returns cancelled for cancelled bookings", () => {
    const b = baseBooking({ status: "cancelled" });
    expect(getOperationalBadge(b)).toBe("cancelled");
  });

  it("returns completed for completed and fully paid bookings", () => {
    const b = baseBooking({ status: "completed", payment_status: "paid", total_paid: 100, total_amount: 100 } as any);
    expect(getOperationalBadge(b)).toBe("completed");
  });

  it("returns ready_to_pay for completed but unpaid bookings", () => {
    const b = baseBooking({ status: "completed", payment_status: "pending", total_paid: 0, total_amount: 100 } as any);
    expect(getOperationalBadge(b)).toBe("ready_to_pay");
  });

  it("returns in_service for in_progress bookings", () => {
    const b = baseBooking({
      status: "in_progress",
      current_stage: "service_started",
    } as any);
    expect(getOperationalBadge(b)).toBe("in_service");
  });

  it("returns checked_in when client_arrived (at-salon)", () => {
    const b = baseBooking({
      status: "confirmed",
      current_stage: "client_arrived",
      location_type: "at_salon",
    } as any);
    expect(getOperationalBadge(b)).toBe("checked_in");
  });

  it("returns late when start time passed by >10 min and still confirmed", () => {
    const past = new Date();
    past.setMinutes(past.getMinutes() - 15);
    const b = baseBooking({
      status: "confirmed",
      scheduled_at: past.toISOString(),
    });
    expect(getOperationalBadge(b)).toBe("late");
  });

  it("returns arriving when within 30 min of start", () => {
    const soon = new Date();
    soon.setMinutes(soon.getMinutes() + 20);
    const b = baseBooking({
      status: "confirmed",
      scheduled_at: soon.toISOString(),
    });
    expect(getOperationalBadge(b)).toBe("arriving");
  });

  it("returns ready_to_pay when service completed but payment pending", () => {
    const b = baseBooking({
      status: "in_progress",
      current_stage: "service_completed",
      payment_status: "pending",
      total_amount: 100,
      total_paid: 0,
    } as any);
    expect(getOperationalBadge(b)).toBe("ready_to_pay");
  });

  it("returns confirmed for future confirmed booking", () => {
    const future = new Date();
    future.setHours(future.getHours() + 2);
    const b = baseBooking({
      status: "confirmed",
      scheduled_at: future.toISOString(),
    });
    expect(getOperationalBadge(b)).toBe("confirmed");
  });
});

describe("matchesQueueTab", () => {
  it("all tab matches any booking", () => {
    const b = baseBooking({ status: "cancelled" });
    expect(matchesQueueTab(b, "all")).toBe(true);
  });

  it("arrivals tab matches late, arriving, checked_in", () => {
    const late = baseBooking({
      status: "confirmed",
      scheduled_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    });
    expect(matchesQueueTab(late, "arrivals")).toBe(true);

    const checked = baseBooking({
      status: "confirmed",
      current_stage: "client_arrived",
      location_type: "at_salon",
    } as any);
    expect(matchesQueueTab(checked, "arrivals")).toBe(true);
  });

  it("in_service tab matches only in_service", () => {
    const inSvc = baseBooking({
      status: "in_progress",
      current_stage: "service_started",
    } as any);
    expect(matchesQueueTab(inSvc, "in_service")).toBe(true);
    expect(matchesQueueTab(baseBooking({ status: "confirmed" }), "in_service")).toBe(false);
  });

  it("completed tab matches completed and cancelled", () => {
    expect(matchesQueueTab(baseBooking({ status: "completed", payment_status: "paid", total_paid: 100, total_amount: 100 } as any), "completed")).toBe(true);
    expect(matchesQueueTab(baseBooking({ status: "cancelled" }), "completed")).toBe(true);
  });
});

describe("getQueueCounts", () => {
  it("counts correctly for mixed bookings", () => {
    const bookings = [
      baseBooking({ status: "confirmed", id: "1" }),
      baseBooking({ status: "cancelled", id: "2" }),
      baseBooking({
        status: "in_progress",
        current_stage: "service_started",
        id: "3",
      } as any),
    ];
    const counts = getQueueCounts(bookings);
    expect(counts.all).toBe(3);
    expect(counts.completed).toBe(1);
    expect(counts.in_service).toBe(1);
  });
});
