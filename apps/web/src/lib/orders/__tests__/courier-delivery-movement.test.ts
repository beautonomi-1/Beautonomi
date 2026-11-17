import { describe, expect, it } from "vitest";
import { strongestCourierMovement } from "@/lib/orders/courier-delivery-movement";
import type { TrackingUpdate } from "@beautonomi/shipping";

function event(status: TrackingUpdate["status"], occurredAt: string, message = status): TrackingUpdate {
  return { status, occurredAt, message };
}

describe("strongestCourierMovement", () => {
  it("treats in transit and out for delivery as shipped", () => {
    expect(strongestCourierMovement([event("in_transit", "2026-01-01T00:00:00Z")]).movement).toBe("shipped");
    expect(strongestCourierMovement([event("out_for_delivery", "2026-01-01T00:00:00Z")]).movement).toBe("shipped");
  });

  it("keeps a delivered scan ahead of an older in-transit scan", () => {
    const result = strongestCourierMovement([
      event("in_transit", "2026-01-02T00:00:00Z", "Collected"),
      event("delivered", "2026-01-01T00:00:00Z", "Delivered"),
    ]);
    expect(result.movement).toBe("delivered");
    expect(result.detail).toBe("Delivered");
  });

  it("records a return or exception without calling it delivered", () => {
    expect(strongestCourierMovement([event("returned", "2026-01-03T00:00:00Z", "Returned to sender")]).movement).toBe(
      "exception",
    );
    expect(strongestCourierMovement([event("exception", "2026-01-03T00:00:00Z", "Failed delivery")]).detail).toBe(
      "Failed delivery",
    );
  });

  it("ignores a pending scan when nothing has moved", () => {
    expect(strongestCourierMovement([event("pending", "2026-01-01T00:00:00Z")]).movement).toBeNull();
    expect(strongestCourierMovement([]).movement).toBeNull();
  });
});
