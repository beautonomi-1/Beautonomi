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
});
