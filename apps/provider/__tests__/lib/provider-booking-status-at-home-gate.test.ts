import { filterInProgressWhenAtHomeVerificationPending } from "@/lib/provider-booking-status-transitions";

describe("filterInProgressWhenAtHomeVerificationPending", () => {
  it("removes in_progress when at-home and OTP pending and not verified", () => {
    expect(
      filterInProgressWhenAtHomeVerificationPending({
        targets: ["in_progress", "cancelled", "no_show"],
        atHome: true,
        arrivalVerified: false,
        arrivalOtpPending: true,
        qrArrivalPending: false,
        currentStage: "provider_arrived",
      }),
    ).toEqual(["cancelled", "no_show"]);
  });

  it("keeps in_progress when verified and arrived", () => {
    expect(
      filterInProgressWhenAtHomeVerificationPending({
        targets: ["in_progress", "cancelled"],
        atHome: true,
        arrivalVerified: true,
        arrivalOtpPending: true,
        qrArrivalPending: false,
        currentStage: "provider_arrived",
      }),
    ).toEqual(["in_progress", "cancelled"]);
  });

  it("removes in_progress when not arrived yet", () => {
    expect(
      filterInProgressWhenAtHomeVerificationPending({
        targets: ["in_progress", "cancelled"],
        atHome: true,
        arrivalVerified: false,
        arrivalOtpPending: false,
        qrArrivalPending: false,
        currentStage: "provider_on_way",
      }),
    ).toEqual(["cancelled"]);
  });

  it("keeps in_progress for salon (not at-home)", () => {
    expect(
      filterInProgressWhenAtHomeVerificationPending({
        targets: ["in_progress", "cancelled"],
        atHome: false,
        arrivalVerified: false,
        arrivalOtpPending: true,
        qrArrivalPending: false,
      }),
    ).toEqual(["in_progress", "cancelled"]);
  });
});
