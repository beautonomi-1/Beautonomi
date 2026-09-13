import { describe, expect, it } from "vitest";
import { resolvePendingNudgeKind } from "../lifecycle-deadlines";
import { pendingConfirmationSlaDisplay } from "../pending-confirmation-sla-copy";
import { shouldSuppressNoShowAfterRunningLate } from "../lifecycle-running-late";
import { mapBookingEmbedToWaitingRoomEntry } from "@/lib/provider-waiting-room/booking-to-waiting-room-entry";
import { isEligiblePreSlotPendingRow } from "../lifecycle-pending-expiry";

describe("recurring series pending eligibility", () => {
  it("treats online pending one-offs as pre-slot expiry candidates", () => {
    expect(
      isEligiblePreSlotPendingRow({
        id: "b1",
        created_at: "2026-09-11T08:00:00.000Z",
        scheduled_at: "2026-09-11T12:00:00.000Z",
        booking_source: "online",
        recurring_series_id: null,
        status: "pending",
      }),
    ).toBe(true);
  });

  it("excludes series visits from request SLA expiry even if they are still pending", () => {
    expect(
      isEligiblePreSlotPendingRow({
        id: "b2",
        created_at: "2026-09-11T08:00:00.000Z",
        scheduled_at: "2026-09-11T12:00:00.000Z",
        booking_source: "online",
        recurring_series_id: "series-1",
        status: "pending",
      }),
    ).toBe(false);
  });
});

describe("pending confirmation nudges", () => {
  it("sends after_create from +30m until the before-expire window", () => {
    const createdAt = new Date("2026-09-11T08:00:00.000Z");
    const expireAt = new Date("2026-09-11T12:00:00.000Z");
    expect(
      resolvePendingNudgeKind({
        now: new Date("2026-09-11T08:20:00.000Z"),
        createdAt,
        expireAt,
      }),
    ).toBeNull();
    expect(
      resolvePendingNudgeKind({
        now: new Date("2026-09-11T08:40:00.000Z"),
        createdAt,
        expireAt,
      }),
    ).toBe("after_create");
  });

  it("sends before_expire in the last 30 minutes", () => {
    const createdAt = new Date("2026-09-11T08:00:00.000Z");
    const expireAt = new Date("2026-09-11T12:00:00.000Z");
    expect(
      resolvePendingNudgeKind({
        now: new Date("2026-09-11T11:40:00.000Z"),
        createdAt,
        expireAt,
      }),
    ).toBe("before_expire");
    expect(
      resolvePendingNudgeKind({
        now: new Date("2026-09-11T12:01:00.000Z"),
        createdAt,
        expireAt,
      }),
    ).toBeNull();
  });
});

describe("pending confirmation SLA copy", () => {
  it("uses last-minute copy when the slot is under two hours away", () => {
    const copy = pendingConfirmationSlaDisplay({
      scheduledAt: "2026-09-11T10:00:00.000Z",
      createdAt: "2026-09-11T09:00:00.000Z",
      paymentStatus: "pending",
      now: new Date("2026-09-11T08:30:00.000Z"),
    });
    expect(copy.lastMinute).toBe(true);
    expect(copy.body).toMatch(/last-minute/i);
  });

  it("says not charged when payment is still pending", () => {
    const copy = pendingConfirmationSlaDisplay({
      scheduledAt: "2026-09-12T10:00:00.000Z",
      createdAt: "2026-09-11T08:00:00.000Z",
      paymentStatus: "pending",
      now: new Date("2026-09-11T08:05:00.000Z"),
    });
    expect(copy.lastMinute).toBe(false);
    expect(copy.body).toMatch(/not charged/);
  });

  it("uses overnight copy when the request is created after closing time", () => {
    const copy = pendingConfirmationSlaDisplay({
      scheduledAt: "2026-06-11T07:00:00.000Z",
      createdAt: "2026-06-10T21:00:00.000Z",
      paymentStatus: "paid",
      timezone: "Africa/Johannesburg",
      workingHours: {
        thursday: { open: "08:00", close: "18:00", closed: false },
      },
    });
    expect(copy.overnight).toBe(true);
    expect(copy.body).toMatch(/opens at/i);
    expect(copy.body).toMatch(/confirm by/i);
    expect(copy.body).toMatch(/refunded in full/);
  });
});

describe("customer status mapping", () => {
  it("keeps confirmed bookings upcoming even after scheduled_at", async () => {
    const { mapStatusToCustomer } = await import("@/lib/utils/booking-status");
    expect(mapStatusToCustomer("confirmed", "2020-01-01T00:00:00.000Z")).toBe("upcoming");
    expect(mapStatusToCustomer("waiting", "2020-01-01T00:00:00.000Z")).toBe("upcoming");
    expect(mapStatusToCustomer("completed", "2020-01-01T00:00:00.000Z")).toBe("past");
    expect(mapStatusToCustomer("no_show", "2020-01-01T00:00:00.000Z")).toBe("past");
  });

  it("keeps late-window appointments on Upcoming and leftovers on Past", async () => {
    const { resolveCustomerListTab } = await import("@/lib/utils/booking-status");
    expect(
      resolveCustomerListTab({
        status: "confirmed",
        scheduledAt: "2020-01-01T00:00:00.000Z",
        lifecycleHint: "late_window",
      }),
    ).toBe("upcoming");
    expect(
      resolveCustomerListTab({
        status: "in_progress",
        scheduledAt: "2020-01-01T00:00:00.000Z",
        lifecycleHint: "awaiting_close_out",
      }),
    ).toBe("past");
    expect(
      resolveCustomerListTab({
        status: "pending",
        scheduledAt: "2099-01-01T00:00:00.000Z",
        lifecycleHint: "upcoming",
      }),
    ).toBe("upcoming");
  });
});

describe("waiting room running-late mapping", () => {
  it("keeps customer running-late fields on waiting-room entries", () => {
    const entry = mapBookingEmbedToWaitingRoomEntry({
      id: "b1",
      customer_running_late_at: "2026-09-11T08:00:00.000Z",
      customer_running_late_minutes: 15,
      customers: { full_name: "Ada" },
    });
    expect(entry.customer_running_late_at).toBe("2026-09-11T08:00:00.000Z");
    expect(entry.customer_running_late_minutes).toBe(15);
    expect(entry.client_name).toBe("Ada");
  });
});

describe("close-out calendar scope", () => {
  it("hides other staff leftovers from own-scope calendars", async () => {
    const { filterBookingsByCalendarScope } = await import("@/lib/auth/calendar-scope");
    const rows = [
      { id: "mine", staff_id: "s1", booking_services: [{ staff_id: "s1" }] },
      { id: "theirs", staff_id: "s2", booking_services: [{ staff_id: "s2" }] },
    ];
    expect(filterBookingsByCalendarScope(rows, "own", "s1").map((r) => r.id)).toEqual(["mine"]);
    expect(filterBookingsByCalendarScope(rows, "all", "s1")).toHaveLength(2);
  });
});

describe("running late window", () => {
  it("allows reports from 30 minutes before start through the last service end", async () => {
    const { canCustomerReportRunningLate } = await import("../lifecycle-running-late");
    const row = {
      status: "confirmed",
      scheduled_at: "2026-09-11T09:00:00.000Z",
      booking_services: [
        { scheduled_end_at: "2026-09-11T09:45:00.000Z", duration_minutes: 45 },
        { scheduled_end_at: "2026-09-11T10:30:00.000Z", duration_minutes: 45 },
      ],
    };
    expect(canCustomerReportRunningLate(row, new Date("2026-09-11T08:29:00.000Z")).ok).toBe(false);
    expect(canCustomerReportRunningLate(row, new Date("2026-09-11T08:31:00.000Z")).ok).toBe(true);
    expect(canCustomerReportRunningLate(row, new Date("2026-09-11T10:00:00.000Z")).ok).toBe(true);
    expect(canCustomerReportRunningLate(row, new Date("2026-09-11T10:31:00.000Z")).ok).toBe(false);
  });

  it("sums service durations when scheduled_end_at is missing", async () => {
    const { canCustomerReportRunningLate } = await import("../lifecycle-running-late");
    const row = {
      status: "confirmed",
      scheduled_at: "2026-09-11T09:00:00.000Z",
      booking_services: [
        { duration_minutes: 45 },
        { duration_minutes: 45 },
      ],
    };
    expect(canCustomerReportRunningLate(row, new Date("2026-09-11T10:00:00.000Z")).ok).toBe(true);
    expect(canCustomerReportRunningLate(row, new Date("2026-09-11T10:31:00.000Z")).ok).toBe(false);
  });
});

describe("pending expiry refund copy", () => {
  it("does not claim a refund when nothing was charged", async () => {
    const { buildPendingExpiryRefundCopy } = await import("../lifecycle-deadlines");
    expect(buildPendingExpiryRefundCopy("pending")).toMatch(/not been charged/);
    expect(buildPendingExpiryRefundCopy("unpaid")).toMatch(/not been charged/);
    expect(buildPendingExpiryRefundCopy("paid")).toMatch(/fully refunded/);
  });

  it("uses distinct copy for SLA-bound expiry vs pre-slot", async () => {
    const { pendingExpiryCancellationReason } = await import("../lifecycle-deadlines");
    expect(pendingExpiryCancellationReason("sla")).toMatch(/reply window/);
    expect(pendingExpiryCancellationReason("pre_slot")).not.toMatch(/reply window/);
    expect(pendingExpiryCancellationReason("janitor")).toMatch(/before the appointment time/);
  });
});

describe("bulk-complete eligibility", () => {
  it("rejects confirmed leftover rows", async () => {
    const { isBulkCompleteEligibleStatus } = await import("@/lib/bookings/lifecycle-close-out");
    expect(isBulkCompleteEligibleStatus("confirmed")).toBe(false);
    expect(isBulkCompleteEligibleStatus("in_progress")).toBe(true);
    expect(isBulkCompleteEligibleStatus("checked_in")).toBe(true);
  });
});

describe("close-out reminder copy and deep link", () => {
  it("does not call a 3-day escalation 'over a week'", async () => {
    const { closeOutReminderTitle, CLOSEOUT_ESCALATION_OWNER_ONLY_AFTER_DAYS } = await import(
      "@/lib/bookings/lifecycle-close-out"
    );
    expect(CLOSEOUT_ESCALATION_OWNER_ONLY_AFTER_DAYS).toBe(3);
    expect(closeOutReminderTitle(true)).toBe("Appointments open for over 3 days");
    expect(closeOutReminderTitle(false)).toBe("Unclosed appointments");
    expect(closeOutReminderTitle(true)).not.toMatch(/week/i);
  });

  it("treats status=close_out and legacy filter=close_out as the same queue link", async () => {
    const { isCloseOutBookingsDeepLink, CLOSE_OUT_BOOKINGS_PATH } = await import(
      "@/lib/bookings/lifecycle-close-out"
    );
    const from = (href: string) => new URL(href, "https://beautonomi.local").searchParams;
    expect(isCloseOutBookingsDeepLink(from(CLOSE_OUT_BOOKINGS_PATH))).toBe(true);
    expect(isCloseOutBookingsDeepLink(from("/provider/bookings?filter=close_out"))).toBe(true);
    expect(isCloseOutBookingsDeepLink(from("/provider/bookings?status=pending"))).toBe(false);
  });
});

describe("no-show suppression after running late", () => {
  it("hides no-show until scheduled + delay + 10 minutes", () => {
    expect(
      shouldSuppressNoShowAfterRunningLate({
        scheduledAt: "2026-09-11T09:00:00.000Z",
        delayMinutes: 15,
        customerRunningLateAt: "2026-09-11T08:50:00.000Z",
        now: new Date("2026-09-11T09:20:00.000Z"),
      }),
    ).toBe(true);
    expect(
      shouldSuppressNoShowAfterRunningLate({
        scheduledAt: "2026-09-11T09:00:00.000Z",
        delayMinutes: 15,
        customerRunningLateAt: "2026-09-11T08:50:00.000Z",
        now: new Date("2026-09-11T09:30:00.000Z"),
      }),
    ).toBe(false);
  });
});

describe("group pending expiry organiser", () => {
  it("prefers primary_contact_booking_id when resolving the notification recipient", async () => {
    const admin = {
      from(table: string) {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve(
                  table === "group_bookings"
                    ? { data: { primary_contact_booking_id: "organiser-1" }, error: null }
                    : { data: null, error: null },
                ),
            }),
          }),
        };
      },
    };
    const { resolveGroupOrganiserBookingId } = await import("../lifecycle-pending-expiry");
    await expect(resolveGroupOrganiserBookingId(admin as never, "group-1")).resolves.toBe(
      "organiser-1",
    );
  });

  it("falls back to the primary-contact participant booking when group.primary is null", async () => {
    const admin = {
      from(table: string) {
        if (table === "group_bookings") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: { primary_contact_booking_id: null }, error: null }),
              }),
            }),
          };
        }
        if (table === "booking_participants") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  not: () => ({
                    limit: () => ({
                      maybeSingle: () =>
                        Promise.resolve({ data: { booking_id: "participant-primary" }, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: { id: "oldest-child" }, error: null }),
                }),
              }),
            }),
          }),
        };
      },
    };
    const { resolveGroupOrganiserBookingId } = await import("../lifecycle-pending-expiry");
    await expect(resolveGroupOrganiserBookingId(admin as never, "group-1")).resolves.toBe(
      "participant-primary",
    );
  });
});
