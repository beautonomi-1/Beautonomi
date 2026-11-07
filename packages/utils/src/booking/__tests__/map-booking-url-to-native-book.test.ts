import { describe, expect, it } from "vitest";
import { mapBookingQueryToNativeBookPath } from "../map-booking-url-to-native-book";

describe("mapBookingQueryToNativeBookPath", () => {
  it("requires slug", () => {
    expect(mapBookingQueryToNativeBookPath("?provider_id=x")).toBeNull();
  });

  it("aliases service and staff query params", () => {
    const path = mapBookingQueryToNativeBookPath(
      "?slug=salon&service=aaa&staff=bbb&location_type=at_home",
    );
    expect(path).toBe("/(app)/book?slug=salon&service_id=aaa&staff_id=bbb&location_type=at_home");
  });
});
