import { describe, expect, it } from "vitest";
import { resolveBookingResourceIds, type OfferingResourceLink } from "../assignment";

const links: OfferingResourceLink[] = [
  { offering_id: "svc-a", resource_id: "room-1", required: true },
  { offering_id: "svc-a", resource_id: "lamp-1", required: false },
  { offering_id: "svc-b", resource_id: "chair-1", required: true },
];

describe("resolveBookingResourceIds", () => {
  it("returns every required resource when nothing is selected", () => {
    expect(resolveBookingResourceIds(links)).toEqual(["room-1", "chair-1"]);
    expect(resolveBookingResourceIds(links, [])).toEqual(["room-1", "chair-1"]);
  });

  it("keeps required resources when the client only selects an optional one", () => {
    expect(resolveBookingResourceIds(links, ["lamp-1"])).toEqual(["room-1", "chair-1", "lamp-1"]);
  });

  it("does not duplicate a required resource that was also selected", () => {
    expect(resolveBookingResourceIds(links, ["room-1"])).toEqual(["room-1", "chair-1"]);
  });

  it("drops selected ids that are not linked to the booked services", () => {
    expect(resolveBookingResourceIds(links, ["other-provider-room"])).toEqual(["room-1", "chair-1"]);
  });

  it("saves optional-only selections for services without required resources", () => {
    const optionalOnly: OfferingResourceLink[] = [
      { offering_id: "svc-c", resource_id: "mirror-1", required: false },
    ];
    expect(resolveBookingResourceIds(optionalOnly, ["mirror-1"])).toEqual(["mirror-1"]);
    expect(resolveBookingResourceIds(optionalOnly, null)).toEqual([]);
  });
});
