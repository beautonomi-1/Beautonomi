import { describe, expect, it } from "vitest";
import type { BookingDraft } from "@/types/beautonomi";
import { applyPublicBookingHoldSnapshotToDraft } from "./apply-hold-snapshot-to-draft";

describe("applyPublicBookingHoldSnapshotToDraft", () => {
  it("overrides draft services, datetime, location from hold snapshot", () => {
    const draft = {
      provider_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      services: [{ offering_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", staff_id: null }],
      selected_datetime: "2026-01-01T10:00:00.000Z",
      location_type: "at_home",
      location_id: null,
    } as unknown as BookingDraft;

    applyPublicBookingHoldSnapshotToDraft(draft, {
      start_at: "2026-06-15T14:30:00.000Z",
      booking_services_snapshot: [
        {
          offering_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          staff_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        },
      ],
      location_type: "at_salon",
      location_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      metadata: { preferred_staff_ids: ["dddddddd-dddd-dddd-dddd-dddddddddddd"] },
    });

    expect(draft.selected_datetime).toBe("2026-06-15T14:30:00.000Z");
    expect(draft.services).toHaveLength(1);
    expect(draft.services[0].offering_id).toBe("cccccccc-cccc-cccc-cccc-cccccccccccc");
    expect(draft.services[0].staff_id).toBe("dddddddd-dddd-dddd-dddd-dddddddddddd");
    expect(draft.location_type).toBe("at_salon");
    expect(draft.location_id).toBe("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
  });

  it("returns preferred_staff_ids from metadata", () => {
    const draft = {
      provider_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      services: [],
      selected_datetime: "2026-01-01T10:00:00.000Z",
      location_type: "at_salon",
      location_id: null,
    } as unknown as BookingDraft;

    const { preferredStaffIds } = applyPublicBookingHoldSnapshotToDraft(draft, {
      start_at: "2026-06-15T14:30:00.000Z",
      booking_services_snapshot: [{ offering_id: "cccccccc-cccc-cccc-cccc-cccccccccccc", staff_id: null }],
      location_type: "at_salon",
      location_id: null,
      metadata: { preferred_staff_ids: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"] },
    });

    expect(preferredStaffIds).toEqual(["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]);
  });

  it("throws when snapshot empty", () => {
    const draft = {
      services: [],
      selected_datetime: "2026-01-01T10:00:00.000Z",
      location_type: "at_salon",
    } as unknown as BookingDraft;

    expect(() =>
      applyPublicBookingHoldSnapshotToDraft(draft, {
        start_at: "2026-06-15T14:30:00.000Z",
        booking_services_snapshot: [],
        location_type: "at_salon",
        location_id: null,
        metadata: {},
      }),
    ).toThrow("HOLD_NO_SERVICES");
  });
});
