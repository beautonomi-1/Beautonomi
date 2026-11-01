import { describe, expect, it } from "vitest";
import {
  computeStaffScheduledHoursReport,
  deliveredHoursForStaff,
} from "../staff-scheduled-hours";

describe("staff-scheduled-hours", () => {
  const staff = [{ id: "s1", users: { full_name: "Alex" } }];

  it("counts completed minutes as delivered and no-show as missed", () => {
    const bookings = [
      {
        id: "b1",
        status: "completed",
        booking_services: [{ staff_id: "s1", offerings: { duration_minutes: 60 } }],
      },
      {
        id: "b2",
        status: "no_show",
        booking_services: [{ staff_id: "s1", offerings: { duration_minutes: 30 } }],
      },
    ];
    const report = computeStaffScheduledHoursReport(staff, bookings);
    expect(report.staffHours[0].deliveredHours).toBe(1);
    expect(report.staffHours[0].missedHours).toBe(0.5);
    expect(report.staffHours[0].completionRate).toBe(50);
  });

  it("puts cancelled minutes only in cancelled bucket", () => {
    const bookings = [
      {
        id: "b1",
        status: "cancelled",
        booking_services: [{ staff_id: "s1", offerings: { duration_minutes: 45 } }],
      },
    ];
    const report = computeStaffScheduledHoursReport(staff, bookings);
    expect(report.staffHours[0].cancelledHours).toBe(0.75);
    expect(report.staffHours[0].deliveredHours).toBe(0);
    expect(report.staffHours[0].missedHours).toBe(0);
  });

  it("treats confirmed visits as not yet completed", () => {
    const bookings = [
      {
        id: "b1",
        status: "confirmed",
        booking_services: [{ staff_id: "s1", offerings: { duration_minutes: 60 } }],
      },
    ];
    const report = computeStaffScheduledHoursReport(staff, bookings);
    expect(report.staffHours[0].notYetCompletedHours).toBe(1);
    expect(report.staffHours[0].completionRate).toBe(0);
  });

  it("deliveredHoursForStaff ignores non-completed", () => {
    const bookings = [
      {
        id: "b1",
        status: "completed",
        booking_services: [{ staff_id: "s1", offerings: { duration_minutes: 60 } }],
      },
      {
        id: "b2",
        status: "no_show",
        booking_services: [{ staff_id: "s1", offerings: { duration_minutes: 30 } }],
      },
    ];
    expect(deliveredHoursForStaff("s1", bookings)).toBe(1);
  });
});
