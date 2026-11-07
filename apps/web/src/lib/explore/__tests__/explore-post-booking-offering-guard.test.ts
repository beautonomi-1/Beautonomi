import { describe, expect, it } from "vitest";
import { explorePostRequiresOfferingForPublish } from "@/lib/explore/explore-post-booking-offering-guard";

const base = {
  nextStatus: "published" as const,
  sourceBookingId: "b1",
  offeringId: null,
  wasAlreadyPublished: false,
  isPublishTransition: true,
  offeringClearedOnPublished: false,
};

describe("explorePostRequiresOfferingForPublish", () => {
  it("rejects publishing a booking-linked look without a service", () => {
    expect(explorePostRequiresOfferingForPublish(base)).toBe(true);
  });

  it("allows publishing with a service", () => {
    expect(explorePostRequiresOfferingForPublish({ ...base, offeringId: "o1" })).toBe(false);
  });

  it("allows drafts and posts without a booking", () => {
    expect(explorePostRequiresOfferingForPublish({ ...base, nextStatus: "draft" })).toBe(false);
    expect(explorePostRequiresOfferingForPublish({ ...base, sourceBookingId: null })).toBe(false);
  });

  it("allows editing an older published look that never had a service", () => {
    expect(
      explorePostRequiresOfferingForPublish({
        ...base,
        wasAlreadyPublished: true,
        isPublishTransition: false,
      }),
    ).toBe(false);
  });

  it("rejects clearing the service on a published look", () => {
    expect(
      explorePostRequiresOfferingForPublish({
        ...base,
        wasAlreadyPublished: true,
        isPublishTransition: false,
        offeringClearedOnPublished: true,
      }),
    ).toBe(true);
  });
});
