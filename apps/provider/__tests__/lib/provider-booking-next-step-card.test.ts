import { getBookingNextStepCard } from "@/lib/provider-booking-next-step-card";

describe("getBookingNextStepCard", () => {
  const opts = { outstanding: 0, isAtHome: true, isAtSalon: false };

  it("shows en-route card for provider_on_way stage", () => {
    const card = getBookingNextStepCard(
      { status: "confirmed", current_stage: "provider_on_way" },
      opts,
    );
    expect(card.title).toBe("Mark arrival next");
    expect(card.icon).toBe("navigate-outline");
  });

  it("shows verify arrival for provider_arrived without verification", () => {
    const card = getBookingNextStepCard(
      {
        status: "confirmed",
        current_stage: "provider_arrived",
        arrival_otp_verified: false,
        qr_code_verified: false,
      },
      opts,
    );
    expect(card.title).toBe("Verify arrival");
  });

  it("shows close-out card when needs_close_out is true", () => {
    const card = getBookingNextStepCard(
      { status: "confirmed", needs_close_out: true, suggested_close_out_action: "review" },
      opts,
    );
    expect(card.title).toBe("Needs close-out");
  });

  it("uses db_status checked_in when portal status is booked", () => {
    const card = getBookingNextStepCard(
      { status: "booked", db_status: "checked_in" },
      { outstanding: 0, isAtHome: false, isAtSalon: true },
    );
    expect(card.title).toBe("Client checked in");
  });

  it("salon confirmed still shows ready for check-in", () => {
    const card = getBookingNextStepCard(
      { status: "booked", db_status: "confirmed" },
      { outstanding: 0, isAtHome: false, isAtSalon: true },
    );
    expect(card.title).toBe("Ready for check-in");
  });

  it("at-home checked_in shows reset copy", () => {
    const card = getBookingNextStepCard(
      { status: "booked", db_status: "checked_in" },
      { outstanding: 0, isAtHome: true, isAtSalon: false },
    );
    expect(card.title).toBe("House call in salon status");
    expect(card.description).toMatch(/Reset to confirmed/);
  });

  it("close-out still takes precedence over db_status", () => {
    const card = getBookingNextStepCard(
      { status: "booked", db_status: "checked_in", needs_close_out: true },
      { outstanding: 0, isAtHome: false, isAtSalon: true, needsCloseOut: true },
    );
    expect(card.title).toBe("Needs close-out");
  });
});
