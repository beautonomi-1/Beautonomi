import { describe, expect, it } from "vitest";
import {
  BOOKING_JOURNEY_BUCKETS,
  bookingStepToJourneyBucket,
} from "../booking-journey-buckets";

describe("booking-journey-buckets", () => {
  it("maps internal steps to five customer buckets", () => {
    expect(BOOKING_JOURNEY_BUCKETS).toEqual([
      "services",
      "venue",
      "time",
      "details",
      "pay",
    ]);
    expect(bookingStepToJourneyBucket("groupParticipants")).toBe("services");
    expect(bookingStepToJourneyBucket("resources")).toBe("time");
    expect(bookingStepToJourneyBucket("forms")).toBe("details");
    expect(bookingStepToJourneyBucket("payment")).toBe("pay");
  });
});
