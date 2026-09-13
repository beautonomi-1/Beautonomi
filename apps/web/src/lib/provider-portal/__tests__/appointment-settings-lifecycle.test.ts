import { describe, expect, it, vi, beforeEach } from "vitest";
import * as appointmentSettings from "@/lib/provider-portal/appointment-settings";

describe("determineAppointmentStatusFromDB booking source", () => {
  beforeEach(() => {
    vi.spyOn(appointmentSettings, "getAppointmentSettingsFromDB").mockResolvedValue({
      defaultAppointmentStatus: "booked",
      autoConfirmAppointments: false,
      requireConfirmationForBookings: true,
      updatedAt: null,
    });
  });

  it("returns confirmed for provider-created bookings even when manual confirm is on", async () => {
    const status = await appointmentSettings.determineAppointmentStatusFromDB(
      {} as never,
      "provider-1",
      undefined,
      { bookingSource: "provider" },
    );
    expect(status).toBe("confirmed");
  });

  it("returns confirmed for walk-in bookings even when manual confirm is on", async () => {
    const status = await appointmentSettings.determineAppointmentStatusFromDB(
      {} as never,
      "provider-1",
      undefined,
      { bookingSource: "walk_in" },
    );
    expect(status).toBe("confirmed");
  });

  it("returns pending for online customer requests when manual confirm is on", async () => {
    const status = await appointmentSettings.determineAppointmentStatusFromDB(
      {} as never,
      "provider-1",
      undefined,
      { bookingSource: "online" },
    );
    expect(status).toBe("pending");
  });
});
