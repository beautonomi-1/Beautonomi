import { describe, expect, it } from "vitest";
import {
  canResendGuestPayLink,
  computeGroupOutstandingBalance,
  participantShareOwed,
} from "../group-booking-utils";

describe("guest pay link eligibility", () => {
  it("allows a resend for pending and partly paid shares", () => {
    expect(canResendGuestPayLink({ share_amount_due: 100, share_amount_paid: 0, share_status: "pending" })).toBe(true);
    expect(canResendGuestPayLink({ share_amount_due: 100, share_amount_paid: 40, share_status: "partially_paid" })).toBe(true);
    expect(participantShareOwed({ share_amount_due: 100, share_amount_paid: 40 })).toBe(60);
    expect(participantShareOwed({ share_amount_due: 100, share_amount_paid: 33.33 })).toBe(66.67);
    expect(
      computeGroupOutstandingBalance(
        [{ price: 100, total_paid: 33.33 } as never],
        { total_price: 0 } as never,
      ),
    ).toBe(66.67);
  });

  it("refuses closed, settled, organizer and non-split rows", () => {
    expect(canResendGuestPayLink({ share_amount_due: 100, share_amount_paid: 100, share_status: "partially_paid" })).toBe(false);
    expect(canResendGuestPayLink({ share_amount_due: 100, share_amount_paid: 0, share_status: "paid" })).toBe(false);
    expect(canResendGuestPayLink({ share_amount_due: 100, share_amount_paid: 0, share_status: "cancelled" })).toBe(false);
    expect(canResendGuestPayLink({ share_amount_due: 100, share_amount_paid: 0, share_status: "waived" })).toBe(false);
    expect(canResendGuestPayLink({ is_primary_contact: true, share_amount_due: 100, share_status: "pending" })).toBe(false);
    expect(canResendGuestPayLink({ share_amount_due: null, share_status: null })).toBe(false);
  });
});
