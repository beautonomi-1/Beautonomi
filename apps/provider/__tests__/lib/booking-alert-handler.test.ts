import {
  dispatchBookingAlertRow,
  flushPendingBookingAlerts,
  handleBookingAlertRow,
  shouldAlertForBooking,
  type BookingAlertRow,
} from "@/lib/booking-alert-handler";

describe("booking-alert-handler", () => {
  const baseRow: BookingAlertRow = {
    id: "booking-1",
    status: "confirmed",
    booking_number: "BN-001",
  };

  it("shows exactly one group alert for N child inserts sharing group_booking_id", () => {
    const seenBookingIds = new Set<string>();
    const seenGroupBookingIds = new Set<string>();
    const pending: BookingAlertRow[] = [];
    const individualAlerts: BookingAlertRow[] = [];
    const groupAlerts: string[] = [];

    const dispatch = {
      showIndividualAlert: (row: BookingAlertRow) => individualAlerts.push(row),
      showGroupAlert: (groupId: string) => groupAlerts.push(groupId),
    };

    const groupId = "group-abc";
    for (let i = 0; i < 3; i++) {
      handleBookingAlertRow(
        { ...baseRow, id: `booking-${i}`, group_booking_id: groupId },
        seenBookingIds,
        seenGroupBookingIds,
        true,
        dispatch,
        pending,
      );
    }

    expect(groupAlerts).toEqual([groupId]);
    expect(individualAlerts).toHaveLength(0);
    expect(seenBookingIds.size).toBe(3);
  });

  it("shows individual alert when group_booking_id is absent", () => {
    const seenBookingIds = new Set<string>();
    const seenGroupBookingIds = new Set<string>();
    const pending: BookingAlertRow[] = [];
    const individualAlerts: BookingAlertRow[] = [];
    const groupAlerts: string[] = [];

    handleBookingAlertRow(baseRow, seenBookingIds, seenGroupBookingIds, true, {
      showIndividualAlert: (row) => individualAlerts.push(row),
      showGroupAlert: (id) => groupAlerts.push(id),
    }, pending);

    expect(individualAlerts).toHaveLength(1);
    expect(groupAlerts).toHaveLength(0);
  });

  it("queues alerts when app is inactive and flushes on foreground", () => {
    const seenBookingIds = new Set<string>();
    const seenGroupBookingIds = new Set<string>();
    const pending: BookingAlertRow[] = [];
    const individualAlerts: BookingAlertRow[] = [];

    handleBookingAlertRow(baseRow, seenBookingIds, seenGroupBookingIds, false, {
      showIndividualAlert: (row) => individualAlerts.push(row),
      showGroupAlert: () => {},
    }, pending);

    expect(individualAlerts).toHaveLength(0);
    expect(seenBookingIds.size).toBe(0);
    expect(pending).toHaveLength(1);

    flushPendingBookingAlerts(pending, seenBookingIds, seenGroupBookingIds, {
      showIndividualAlert: (row) => individualAlerts.push(row),
      showGroupAlert: () => {},
    });

    expect(individualAlerts).toHaveLength(1);
    expect(pending).toHaveLength(0);
  });

  it("filters non-alertable statuses", () => {
    expect(shouldAlertForBooking({ ...baseRow, status: "cancelled" })).toBe(false);
    expect(shouldAlertForBooking({ ...baseRow, status: "pending" })).toBe(true);
  });

  it("dedupes repeated booking ids on dispatch", () => {
    const seenBookingIds = new Set<string>();
    const seenGroupBookingIds = new Set<string>();
    const individualAlerts: BookingAlertRow[] = [];

    const dispatch = {
      showIndividualAlert: (row: BookingAlertRow) => individualAlerts.push(row),
      showGroupAlert: () => {},
    };

    dispatchBookingAlertRow(baseRow, seenBookingIds, seenGroupBookingIds, dispatch);
    dispatchBookingAlertRow(baseRow, seenBookingIds, seenGroupBookingIds, dispatch);

    expect(individualAlerts).toHaveLength(1);
  });
});
