import { describe, expect, it } from "vitest";
import { pickGroupBookingPatchPayload } from "../pick-group-booking-patch-payload";

describe("pickGroupBookingPatchPayload", () => {
  it("keeps products on the group_bookings patch payload (JSONB), not booking line keys", () => {
    const out = pickGroupBookingPatchPayload({
      products: [{ product_id: "p1", quantity: 2, unit_price: 10, total_price: 20 }],
      services: [{ offering_id: "off-1", staff_id: "st-1" }],
      booking_products: [{ id: "bp-1" }],
    });
    expect(out.products).toEqual([{ product_id: "p1", quantity: 2, unit_price: 10, total_price: 20 }]);
    expect(out).not.toHaveProperty("services");
    expect(out).not.toHaveProperty("booking_products");
  });

  it("maps booking aliases: special_requests → notes, team_member_id → staff_id", () => {
    const out = pickGroupBookingPatchPayload({
      special_requests: "Please bring towels",
      team_member_id: "staff-uuid",
    });
    expect(out.notes).toBe("Please bring towels");
    expect(out.staff_id).toBe("staff-uuid");
  });

  it("passes mobile split date fields used by PATCH /api/provider/group-bookings/[id]", () => {
    const out = pickGroupBookingPatchPayload({
      scheduled_date: "2026-06-01",
      scheduled_time: "14:30",
      allow_override: true,
    });
    expect(out.scheduled_date).toBe("2026-06-01");
    expect(out.scheduled_time).toBe("14:30");
    expect(out.allow_override).toBe(true);
  });

  it("lets explicit notes override special_requests", () => {
    const out = pickGroupBookingPatchPayload({
      special_requests: "from special",
      notes: "from notes",
    });
    expect(out.notes).toBe("from notes");
  });
});
