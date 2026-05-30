import {
  patchGroupMarkPaid,
  patchParticipantCheckIn,
  patchParticipantCheckOut,
  patchParticipantRefund,
  participantsEqual,
} from "@/features/group-bookings/optimisticGroupPatch";

const baseGroup = {
  id: "group-1",
  status: "confirmed",
  participants: [
    {
      id: "p1",
      booking_id: "b1",
      price: 100,
      payment_status: "pending",
      balance_due: 100,
      total_paid: 0,
    },
    {
      id: "p2",
      booking_id: "b2",
      price: 80,
      payment_status: "pending",
      balance_due: 80,
      total_paid: 0,
    },
  ],
};

describe("optimisticGroupPatch", () => {
  it("marks participants paid on patchGroupMarkPaid", () => {
    const now = "2026-06-01T10:00:00.000Z";
    const next = patchGroupMarkPaid(baseGroup, now);
    expect(next.participants?.[0]).toMatchObject({
      payment_status: "paid",
      balance_due: 0,
      total_paid: 100,
    });
    expect(next.updated_at).toBe(now);
  });

  it("checks in participant and starts group", () => {
    const now = "2026-06-01T10:00:00.000Z";
    const next = patchParticipantCheckIn(baseGroup, "p1", now);
    expect(next.status).toBe("started");
    expect(next.participants?.[0]).toMatchObject({
      checked_in: true,
      checked_in_at: now,
    });
  });

  it("checks out participant and completes group when all out", () => {
    const now = "2026-06-01T11:00:00.000Z";
    const checkedIn = patchParticipantCheckIn(baseGroup, "p1", now);
    const checkedIn2 = patchParticipantCheckIn(checkedIn, "p2", now);
    const out1 = patchParticipantCheckOut(checkedIn2, "p1", now);
    expect(out1.status).not.toBe("completed");
    const out2 = patchParticipantCheckOut(out1, "p2", now);
    expect(out2.status).toBe("completed");
  });

  it("applies partial refund math", () => {
    const paid = patchGroupMarkPaid(baseGroup, "2026-06-01T10:00:00.000Z");
    const refunded = patchParticipantRefund(paid, "p1", 40, "2026-06-01T10:30:00.000Z");
    expect(refunded.participants?.[0]).toMatchObject({
      total_refunded: 40,
      balance_due: 40,
      payment_status: "partially_refunded",
    });
  });

  it("detects participant payment changes", () => {
    const paid = patchGroupMarkPaid(baseGroup, "2026-06-01T10:00:00.000Z");
    expect(participantsEqual(baseGroup.participants, paid.participants)).toBe(false);
    expect(participantsEqual(paid.participants, paid.participants)).toBe(true);
  });
});
