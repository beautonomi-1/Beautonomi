import { describe, expect, it } from "vitest";
import { addMoney } from "@beautonomi/utils";
import { allocateLedgerNetByStaff, averageOfLedgerNets, bookingLineShares } from "../staff-ledger-revenue";

describe("allocateLedgerNetByStaff", () => {
  it("makes three stylists' shares add up to the booking", () => {
    const shares = allocateLedgerNetByStaff(new Map([["saturday", 200]]), [
      {
        id: "saturday",
        booking_services: [
          { staff_id: "alex", price: 100 },
          { staff_id: "jo", price: 100 },
          { staff_id: "sam", price: 100 },
        ],
      },
    ]);
    const alex = shares.get("alex") ?? 0;
    const jo = shares.get("jo") ?? 0;
    const sam = shares.get("sam") ?? 0;
    expect(alex + jo + sam).toBe(200);
    expect(alex).toBe(66.67);
    expect(jo).toBe(66.67);
    expect(sam).toBe(66.66);
  });

  it("makes a refund add up across the same stylists", () => {
    const shares = bookingLineShares(-200, [{ price: 100 }, { price: 100 }, { price: 100 }]);
    expect(shares.reduce((sum, share) => addMoney(sum, share), 0)).toBe(-200);
    expect(shares).toEqual([-66.67, -66.67, -66.66]);
  });

  it("averages a refund into the booking", () => {
    expect(averageOfLedgerNets([200, -50])).toBe(75);
    expect(averageOfLedgerNets([200, 0])).toBe(100);
    expect(averageOfLedgerNets([])).toBe(0);
  });
});
