import { describe, expect, it } from "vitest";
import { pendingConfirmationSlaDisplay, slaSettingsFromHours } from "../pendingConfirmationSlaDisplay";
import {
  buildCustomerRebookParams,
  buildRebookOfferingParams,
  buildWebRebookHref,
} from "../rebook-from-booking";

describe("pendingConfirmationSlaDisplay", () => {
  it("uses overnight copy when the request is created after closing time", () => {
    const copy = pendingConfirmationSlaDisplay({
      scheduledAt: "2026-06-11T07:00:00.000Z",
      createdAt: "2026-06-10T21:00:00.000Z",
      paymentStatus: "paid",
      timezone: "Africa/Johannesburg",
      workingHours: {
        thursday: { open: "08:00", close: "18:00", closed: false },
      },
    });
    expect(copy.overnight).toBe(true);
    expect(copy.body).toMatch(/opens at/i);
  });

  it("maps provider SLA hours for the offline fallback", () => {
    expect(
      slaSettingsFromHours({
        confirmation_sla_hours: 4,
        unconfirmed_expire_hours_before_slot: 3,
      }),
    ).toEqual({
      confirmationSlaHours: 4,
      unconfirmedExpireHoursBeforeSlot: 3,
    });
  });
});

describe("rebook-from-booking", () => {
  it("builds a web href with provider, service, and staff — no date or time", () => {
    const href = buildWebRebookHref(
      "salon-a",
      [{ offering_id: "off-1", staff_id: "staff-1" }],
      { locationId: "loc-1", locationType: "at_salon" },
    );
    expect(href).toBe(
      "/book/salon-a?service=off-1&staff=staff-1&location=loc-1&location_type=at_salon",
    );
    expect(href).not.toMatch(/date=/);
  });

  it("builds multi-service params for the customer app", () => {
    expect(
      buildRebookOfferingParams([
        { offering_id: "off-1" },
        { offering_id: "off-2" },
      ]),
    ).toEqual({
      services: "off-1,off-2",
      service_ids: "off-1,off-2",
    });
  });

  it("builds customer app params without a slot date", () => {
    expect(
      buildCustomerRebookParams(
        "salon-a",
        [{ offering_id: "off-1", staff_id: "staff-1" }],
        { locationId: "loc-1", locationType: "at_home" },
      ),
    ).toEqual({
      slug: "salon-a",
      service_id: "off-1",
      staff_id: "staff-1",
      location_id: "loc-1",
      location_type: "at_home",
    });
  });
});
