import {
  filterInProgressWhenAtHomeVerificationPending,
  filterStatusTargetsForBookingType,
  isSalonOnlyBookingStatus,
} from "@/lib/provider-booking-status-transitions";

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

describe("isSalonOnlyBookingStatus", () => {
  it("flags only the salon physical states", () => {
    expect(isSalonOnlyBookingStatus("checked_in")).toBe(true);
    expect(isSalonOnlyBookingStatus("waiting")).toBe(true);
    expect(isSalonOnlyBookingStatus("confirmed")).toBe(false);
    expect(isSalonOnlyBookingStatus("in_progress")).toBe(false);
    expect(isSalonOnlyBookingStatus(null)).toBe(false);
  });
});

describe("filterStatusTargetsForBookingType", () => {
  it("strips salon-only states from at-home transition targets", () => {
    expect(
      filterStatusTargetsForBookingType({
        targets: ["checked_in", "in_progress", "cancelled", "no_show"],
        atHome: true,
        arrivalVerified: true,
        arrivalOtpPending: false,
        qrArrivalPending: false,
        currentStage: "provider_arrived",
        currentDbStatus: "confirmed",
      }),
    ).toEqual(["in_progress", "cancelled", "no_show"]);
  });

  it("preserves salon-only states for at-salon transition targets", () => {
    expect(
      filterStatusTargetsForBookingType({
        targets: ["checked_in", "in_progress", "cancelled", "no_show"],
        atHome: false,
        arrivalVerified: false,
        arrivalOtpPending: false,
        qrArrivalPending: false,
        currentDbStatus: "confirmed",
      }),
    ).toEqual(["checked_in", "in_progress", "cancelled", "no_show"]);
  });

  it("composes both at-home rules: in_progress gating + salon-only stripping", () => {
    expect(
      filterStatusTargetsForBookingType({
        targets: ["checked_in", "in_progress", "cancelled", "no_show"],
        atHome: true,
        arrivalVerified: false,
        arrivalOtpPending: true,
        qrArrivalPending: false,
        currentStage: null,
        currentDbStatus: "confirmed",
      }),
    ).toEqual(["cancelled", "no_show"]);
  });

  it("injects a confirmed recovery target for at-home stuck in checked_in", () => {
    const result = filterStatusTargetsForBookingType({
      targets: ["in_progress", "cancelled"],
      atHome: true,
      arrivalVerified: false,
      arrivalOtpPending: false,
      qrArrivalPending: false,
      currentStage: null,
      currentDbStatus: "checked_in",
    });
    expect(result[0]).toBe("confirmed");
    expect(result).toContain("cancelled");
  });

  it("does NOT inject the recovery target for at-salon checked_in (salon flow continues normally)", () => {
    const result = filterStatusTargetsForBookingType({
      targets: ["in_progress", "cancelled"],
      atHome: false,
      arrivalVerified: false,
      arrivalOtpPending: false,
      qrArrivalPending: false,
      currentDbStatus: "checked_in",
    });
    expect(result).not.toContain("confirmed");
    expect(result).toEqual(["in_progress", "cancelled"]);
  });
});
