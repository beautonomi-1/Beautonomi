import { describe, expect, it } from "vitest";
import { getBookingNextStepCard } from "./provider-booking-next-step-card";

describe("getBookingNextStepCard", () => {
  it("uses db_status checked_in when portal status is booked", () => {
    const card = getBookingNextStepCard(
      { status: "booked", db_status: "checked_in" },
      { outstanding: 0, isAtHome: false, isAtSalon: true },
    );
    expect(card.title).toBe("Client checked in");
  });

  it("salon waiting shows client is waiting", () => {
    const card = getBookingNextStepCard(
      { status: "booked", db_status: "waiting" },
      { outstanding: 0, isAtHome: false, isAtSalon: true },
    );
    expect(card.title).toBe("Client is waiting");
  });

  it("at-home checked_in shows reset copy", () => {
    const card = getBookingNextStepCard(
      { status: "booked", db_status: "checked_in" },
      { outstanding: 0, isAtHome: true, isAtSalon: false },
    );
    expect(card.title).toBe("House call in salon status");
  });
});