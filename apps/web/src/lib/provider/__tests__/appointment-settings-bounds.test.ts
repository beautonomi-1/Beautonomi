import { describe, expect, it } from "vitest";
import { appointmentSettingsTimingError } from "../appointment-settings-bounds";

describe("appointmentSettingsTimingError (F3-23)", () => {
  it("accepts in-range integers", () => {
    expect(
      appointmentSettingsTimingError({
        confirmationSlaHours: 24,
        unconfirmedExpireHoursBeforeSlot: 2,
        closeoutGraceMinutesSalon: 15,
        closeoutGraceMinutesAtHome: 30,
        lateArrivalGraceMinutes: 10,
      }),
    ).toBeNull();
  });

  it("rejects unbounded SLA / expiry hours", () => {
    expect(appointmentSettingsTimingError({ confirmationSlaHours: 10_000 })).toMatch(
      /confirmationSlaHours/,
    );
    expect(appointmentSettingsTimingError({ unconfirmedExpireHoursBeforeSlot: -1 })).toMatch(
      /unconfirmedExpireHoursBeforeSlot/,
    );
  });

  it("rejects non-integers", () => {
    expect(appointmentSettingsTimingError({ lateArrivalGraceMinutes: 1.5 })).toMatch(
      /lateArrivalGraceMinutes/,
    );
  });
});
