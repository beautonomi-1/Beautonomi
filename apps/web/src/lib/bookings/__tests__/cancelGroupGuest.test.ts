import { describe, it, expect, vi, beforeEach } from "vitest";

const cancelParticipant = vi.fn();
vi.mock("@/lib/bookings/group-booking-cancellation", () => ({
  cancelGroupBookingParticipant: (...args: unknown[]) => cancelParticipant(...args),
}));

const closeInvites = vi.fn();
vi.mock("@/lib/bookings/group-invites", () => ({
  closeGroupInvitesForParticipant: (...args: unknown[]) => closeInvites(...args),
}));
vi.mock("@/lib/bookings/recalculate-group-total", () => ({
  tryRecalculateGroupBookingTotal: vi.fn(),
}));

const guestRefund = vi.fn();
vi.mock("@/lib/bookings/group-guest-refunds", () => ({
  refundGroupGuestSharePayments: (...args: unknown[]) => guestRefund(...args),
}));

const walletRefund = vi.fn();
vi.mock("@/lib/bookings/refund-processing", () => ({
  processBookingRefund: (...args: unknown[]) => walletRefund(...args),
}));

const loadOutcome = vi.fn();
vi.mock("@/lib/bookings/load-cancellation-outcome", () => ({
  loadCancellationOutcomeForBooking: (...args: unknown[]) => loadOutcome(...args),
}));

import { cancelGroupGuest } from "../cancelGroupGuest";
import { repriceBookingAfterLineRemoval } from "../repriceBookingAfterLineRemoval";

type Row = Record<string, unknown>;

function makeAdmin(state: {
  participant: Row | null;
  group: Row | null;
  booking: Row;
  lines: Row[];
  payments?: Row[];
  refunds?: Row[];
}) {
  const updates: Array<{ table: string; patch: Row }> = [];
  const deletes: Array<{ table: string; filters: Row }> = [];

  const admin = {
    from(table: string) {
      const filters: Row = {};
      let op: "select" | "update" | "delete" = "select";
      let patch: Row = {};
      const chain: any = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        },
        in: () => chain,
        update: (p: Row) => {
          op = "update";
          patch = p;
          return chain;
        },
        delete: () => {
          op = "delete";
          return chain;
        },
        maybeSingle: async () => {
          if (table === "booking_participants") return { data: state.participant, error: null };
          if (table === "group_bookings") return { data: state.group, error: null };
          if (table === "bookings") return { data: state.booking, error: null };
          return { data: null, error: null };
        },
        then: (resolve: (v: unknown) => void) => {
          if (op === "update") {
            updates.push({ table, patch });
            if (table === "bookings") Object.assign(state.booking, patch);
            resolve({ error: null });
            return;
          }
          if (op === "delete" && table === "booking_services") {
            deletes.push({ table, filters: { ...filters } });
            const removed = state.lines.filter(
              (l) => l.booking_id === filters.booking_id && l.group_participant_id === filters.group_participant_id,
            );
            state.lines = state.lines.filter((l) => !removed.includes(l));
            resolve({ data: removed, error: null });
            return;
          }
          if (table === "booking_payments") {
            resolve({ data: state.payments ?? [], error: null });
            return;
          }
          if (table === "booking_refunds") {
            resolve({ data: state.refunds ?? [], error: null });
            return;
          }
          resolve({ data: null, error: null });
        },
      };
      return chain;
    },
  };
  return { admin: admin as any, updates, deletes, state };
}

describe("repriceBookingAfterLineRemoval", () => {
  it("subtracts removed lines and scales tax, keeping other charges", async () => {
    const { admin, state } = makeAdmin({
      participant: null,
      group: null,
      booking: { subtotal: 300, tax_amount: 45, total_amount: 375 },
      lines: [],
    });
    const res = await repriceBookingAfterLineRemoval(admin, "lead-1", 100);
    expect(res).toEqual({ subtotal: 200, taxAmount: 30, totalAmount: 260 });
    expect(state.booking).toMatchObject({ subtotal: 200, tax_amount: 30, total_amount: 260 });
  });
});

describe("cancelGroupGuest", () => {
  beforeEach(() => {
    cancelParticipant.mockReset();
    closeInvites.mockReset();
    guestRefund.mockReset().mockResolvedValue({ guestPaidNet: 0, refunded: 0, failed: 0 });
    walletRefund.mockReset().mockImplementation(async (_id: string, amount: number) => ({
      success: true,
      amount,
    }));
    loadOutcome.mockReset();
  });

  it("refuses to remove the primary contact", async () => {
    const { admin } = makeAdmin({
      participant: { id: "p1", booking_id: "lead-1", group_booking_id: "g1", is_primary_contact: true },
      group: { primary_contact_booking_id: "lead-1" },
      booking: {},
      lines: [],
    });
    const res = await cancelGroupGuest(admin, { participantId: "p1", groupBookingId: "g1", cancelledBy: "u1" });
    expect(res).toEqual({ ok: false, code: "PRIMARY_PARTICIPANT" });
    expect(cancelParticipant).not.toHaveBeenCalled();
  });

  it("returns not found for a participant outside the group", async () => {
    const { admin } = makeAdmin({ participant: null, group: null, booking: {}, lines: [] });
    const res = await cancelGroupGuest(admin, { participantId: "p9", groupBookingId: "g1", cancelledBy: "u1" });
    expect(res).toEqual({ ok: false, code: "PARTICIPANT_NOT_FOUND" });
  });

  it("cancels a guest's own child booking", async () => {
    const { admin, deletes } = makeAdmin({
      participant: { id: "p2", booking_id: "child-2", group_booking_id: "g1", is_primary_contact: false },
      group: { primary_contact_booking_id: "lead-1" },
      booking: {},
      lines: [],
    });
    const res = await cancelGroupGuest(admin, { participantId: "p2", groupBookingId: "g1", cancelledBy: "u1" });
    expect(res).toMatchObject({ ok: true, mode: "child_booking" });
    expect(cancelParticipant).toHaveBeenCalledWith(admin, "child-2", "p2", "u1", "Removed from group booking");
    expect(deletes).toHaveLength(0);
  });

  const taggedState = (paidVia: "online" | "cash" = "online") => ({
    participant: { id: "p3", booking_id: null, group_booking_id: "g1", is_primary_contact: false },
    group: { primary_contact_booking_id: "lead-1" },
    booking: {
      status: "confirmed",
      currency: "ZAR",
      subtotal: 300,
      tax_amount: 0,
      total_amount: 300,
      total_paid: 300,
      total_refunded: 0,
      customer_id: "cust-1",
    } as Row,
    lines: [
      { id: "l1", booking_id: "lead-1", group_participant_id: "p1", price: 200 },
      { id: "l2", booking_id: "lead-1", group_participant_id: "p3", price: 100 },
    ],
    payments: [
      paidVia === "online"
        ? { id: "pay-1", amount: 300, payment_method: "card", payment_provider: "paystack", status: "completed" }
        : { id: "pay-1", amount: 300, payment_method: "cash", payment_provider: "cash", status: "completed" },
    ] as Row[],
  });

  it("organizer paid in cash: no wallet credit, the overpayment is due in person", async () => {
    const { admin, state } = makeAdmin(taggedState("cash"));
    const res = await cancelGroupGuest(admin, { participantId: "p3", groupBookingId: "g1", cancelledBy: "u1" });
    expect(res).toMatchObject({
      ok: true,
      mode: "booking_lines",
      walletCredited: 0,
      overpaidAmount: 100,
      in_person_refund_due: 100,
    });
    expect(walletRefund).not.toHaveBeenCalled();
    expect(state.lines.map((l) => l.id)).toEqual(["l1"]);
  });

  it("organizer paid for the guest: removes lines and credits the organizer's wallet", async () => {
    const { admin, state, updates } = makeAdmin(taggedState());
    const res = await cancelGroupGuest(admin, { participantId: "p3", groupBookingId: "g1", cancelledBy: "u1" });
    expect(res).toEqual({
      ok: true,
      mode: "booking_lines",
      leadBookingId: "lead-1",
      removedLines: 1,
      guestRefunded: 0,
      walletCredited: 100,
      overpaidAmount: 0,
      in_person_refund_due: 0,
    });
    expect(state.lines.map((l) => l.id)).toEqual(["l1"]);
    expect(state.booking.total_amount).toBe(200);
    expect(walletRefund).toHaveBeenCalledWith("lead-1", 100, "ZAR", expect.anything(), {
      isLateCancellation: false,
      maxWalletCredit: 100,
    });
    expect(updates).toContainEqual({
      table: "booking_participants",
      patch: expect.objectContaining({ participant_payment_status: "cancelled" }),
    });
    expect(closeInvites).toHaveBeenCalledWith(admin, "p3", "cancelled");
    expect(cancelParticipant).not.toHaveBeenCalled();
  });

  it("guest paid their own share: refunds the guest's card, organizer gets nothing", async () => {
    const { admin, state } = makeAdmin(taggedState());
    guestRefund.mockImplementation(async () => {
      state.booking.total_refunded = 100;
      return { guestPaidNet: 100, refunded: 100, failed: 0 };
    });
    const res = await cancelGroupGuest(admin, { participantId: "p3", groupBookingId: "g1", cancelledBy: "u1" });
    expect(res).toMatchObject({ ok: true, guestRefunded: 100, walletCredited: 0, overpaidAmount: 0 });
    expect(guestRefund).toHaveBeenCalledWith(admin, expect.objectContaining({ bookingId: "lead-1", participantId: "p3" }));
    expect(walletRefund).not.toHaveBeenCalled();
  });

  it("does not credit the organizer with guest money whose card refund failed", async () => {
    const { admin } = makeAdmin(taggedState());
    guestRefund.mockResolvedValue({ guestPaidNet: 100, refunded: 0, failed: 100 });
    const res = await cancelGroupGuest(admin, { participantId: "p3", groupBookingId: "g1", cancelledBy: "u1" });
    expect(res).toMatchObject({ ok: true, guestRefunded: 0, walletCredited: 0, overpaidAmount: 0 });
    expect(walletRefund).not.toHaveBeenCalled();
  });

  it("refuses once the lead booking is closed", async () => {
    const s = taggedState();
    s.booking.status = "cancelled";
    const { admin, state } = makeAdmin(s);
    const res = await cancelGroupGuest(admin, { participantId: "p3", groupBookingId: "g1", cancelledBy: "u1" });
    expect(res).toEqual({ ok: false, code: "BOOKING_CLOSED" });
    expect(state.lines).toHaveLength(2);
  });

  it("guest self-cancel is refused after the free-cancellation window", async () => {
    const { admin, state } = makeAdmin(taggedState());
    loadOutcome.mockResolvedValue({
      outcome: { allowed: true, isLate: true, policy: { late_cancellation_type: "partial_refund" } },
    });
    const res = await cancelGroupGuest(admin, {
      participantId: "p3",
      groupBookingId: "g1",
      cancelledBy: "u1",
      enforcePolicyWindow: true,
    });
    expect(res).toEqual({ ok: false, code: "CANCELLATION_WINDOW_CLOSED" });
    expect(state.lines).toHaveLength(2);
  });
});
