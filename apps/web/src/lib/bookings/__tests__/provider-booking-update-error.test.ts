import { describe, expect, it } from "vitest";
import { providerBookingUpdateErrorResponse } from "../provider-booking-update-error";

describe("providerBookingUpdateErrorResponse", () => {
  it("maps 23514 to BOOKING_DATA_INVALID 409", async () => {
    const res = providerBookingUpdateErrorResponse("booking-1", {
      code: "23514",
      message: "Total amount validation failed",
    });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(409);
    const body = await res!.json();
    expect(body.error.code).toBe("BOOKING_DATA_INVALID");
    expect(body.error.message).toContain("amounts don't add up");
  });

  it("returns null for unknown database errors", () => {
    expect(
      providerBookingUpdateErrorResponse("booking-1", {
        code: "42501",
        message: "permission denied",
      }),
    ).toBeNull();
  });
});
