import { describe, expect, it } from "vitest";
import {
  bookingHoldSlotUnavailableResponse,
  GENERIC_SLOT_UNAVAILABLE_MESSAGE,
} from "../booking-hold-slot-errors";

describe("bookingHoldSlotUnavailableResponse", () => {
  it("returns generic message with slot_error_code in details", async () => {
    const res = bookingHoldSlotUnavailableResponse("NO_STAFF_AVAILABLE");
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error?.message).toBe(GENERIC_SLOT_UNAVAILABLE_MESSAGE);
    expect(json.error?.code).toBe("CONFLICT");
    expect(json.error?.details?.slot_error_code).toBe("NO_STAFF_AVAILABLE");
  });
});
