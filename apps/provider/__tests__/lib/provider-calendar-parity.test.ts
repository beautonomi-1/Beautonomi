import {
  expandBookingsForCalendar,
  normalizeCalendarWallClockLoose,
  parseCalendarTimeStrict,
  validateCalendarTimeRange,
} from "@/lib/provider-calendar-parity";

describe("provider calendar parity helpers", () => {
  it("strictly parses HH:MM calendar times", () => {
    expect(parseCalendarTimeStrict("12:30")).toBe(750);
    expect(parseCalendarTimeStrict("9:30")).toBeNull();
    expect(parseCalendarTimeStrict("24:00")).toBeNull();
    expect(parseCalendarTimeStrict("12:99")).toBeNull();
  });

  it("normalizeCalendarWallClockLoose pads times so strict parser accepts overlay API shapes", () => {
    expect(normalizeCalendarWallClockLoose("9:30")).toBe("09:30");
    expect(parseCalendarTimeStrict(normalizeCalendarWallClockLoose("9:30")!)).toBe(570);
    expect(normalizeCalendarWallClockLoose("12:05")).toBe("12:05");
    expect(parseCalendarTimeStrict(normalizeCalendarWallClockLoose("12:05")!)).toBe(725);
  });

  it("validates block ranges before creating time blocks", () => {
    expect(validateCalendarTimeRange("12:00", "13:00")).toEqual({
      ok: true,
      startTime: "12:00",
      endTime: "13:00",
      startMinutes: 720,
      endMinutes: 780,
    });
    expect(validateCalendarTimeRange("12:00", "12:00")).toEqual({ ok: false, reason: "order" });
    expect(validateCalendarTimeRange("noon", "13:00")).toEqual({ ok: false, reason: "format" });
  });

  it("expands bookings into service-line calendar rows while keeping the booking id", () => {
    const rows = expandBookingsForCalendar([
      {
        id: "booking-1",
        scheduled_at: "2026-04-29T09:00:00.000Z",
        total_amount: 100,
        currency: "ZAR",
        services: [
          {
            name: "Cut",
            duration_minutes: 30,
            staff_id: "staff-a",
            staff_name: "Ava Stylist",
            scheduled_start_at: "2026-04-29T09:00:00.000Z",
          },
          {
            name: "Colour",
            duration_minutes: 60,
            staff_id: "staff-b",
            staff_name: "Bea Colourist",
            scheduled_start_at: "2026-04-29T09:30:00.000Z",
          },
        ],
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe("booking-1");
    expect(rows[0]?.calendar_item_id).toBe("booking-1__svc_0");
    expect(rows[0]?.calendar_staff_id).toBe("staff-a");
    expect(rows[0]?.scheduled_at).toBe("2026-04-29T09:00:00.000Z");
    expect(rows[1]?.calendar_item_id).toBe("booking-1__svc_1");
    expect(rows[1]?.calendar_staff_id).toBe("staff-b");
    expect(rows[1]?.scheduled_at).toBe("2026-04-29T09:30:00.000Z");
  });

  it("expandBookingsForCalendar uses booking-level time and synthetic service when services are empty", () => {
    const rows = expandBookingsForCalendar([
      {
        id: "b-empty",
        scheduled_at: "2026-05-01T10:00:00.000Z",
        total_amount: 200,
        services: [],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.scheduled_at).toBe("2026-05-01T10:00:00.000Z");
    expect(rows[0]?.calendar_price).toBe(200);
    expect(rows[0]?.services?.[0]?.name).toBe("Service");
  });

  it("expandBookingsForCalendar prefers per-service price when booking total is missing", () => {
    const rows = expandBookingsForCalendar([
      {
        id: "b-price",
        scheduled_at: "2026-05-01T10:00:00.000Z",
        total_amount: null,
        services: [{ name: "Cut", duration_minutes: 30, price: 450 }],
      },
    ]);
    expect(rows[0]?.total_amount).toBe(450);
    expect(rows[0]?.calendar_price).toBe(450);
  });
});
