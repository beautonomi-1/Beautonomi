import { describe, expect, it } from "vitest";
import { flattenHoldServicesForGroupBooking } from "../flatten-group-booking-services";

describe("flattenHoldServicesForGroupBooking", () => {
  const offeringA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const offeringB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const staff1 = "11111111-1111-1111-1111-111111111111";

  it("returns snapshot only when there are no group participants", () => {
    expect(
      flattenHoldServicesForGroupBooking(
        [{ offering_id: offeringA, staff_id: staff1 }],
        [],
      ),
    ).toEqual([{ offering_id: offeringA, staff_id: staff1 }]);
  });

  it("appends guest service lines from group_participants after the primary snapshot", () => {
    expect(
      flattenHoldServicesForGroupBooking(
        [{ offering_id: offeringA, staff_id: staff1 }],
        [{ service_ids: [offeringB] }],
      ),
    ).toEqual([
      { offering_id: offeringA, staff_id: staff1 },
      { offering_id: offeringB, staff_id: null },
    ]);
  });
});
