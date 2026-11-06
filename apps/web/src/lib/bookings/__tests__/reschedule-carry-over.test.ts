import { describe, expect, it } from "vitest";
import { classifyRescheduleCarryOver } from "../reschedule-carry-over";

describe("classifyRescheduleCarryOver", () => {
  it("carries card, wallet and captured gift money as wallet credit", () => {
    const result = classifyRescheduleCarryOver({
      collected: 150,
      reservedGiftAmount: 0,
      inPersonAmount: 0,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.credit).toBe(150);
  });

  it("leaves a still-reserved gift redemption on the card", () => {
    const result = classifyRescheduleCarryOver({
      collected: 150,
      reservedGiftAmount: 40,
      inPersonAmount: 0,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.credit).toBe(110);
  });

  it("blocks in-person money", () => {
    const result = classifyRescheduleCarryOver({
      collected: 80,
      reservedGiftAmount: 0,
      inPersonAmount: 80,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("RESCHEDULE_IN_PERSON_FUNDS");
  });

  it("sends group bookings to the group reschedule route", () => {
    const result = classifyRescheduleCarryOver({
      groupBookingId: "g1",
      collected: 50,
      reservedGiftAmount: 0,
      inPersonAmount: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("GROUP_RESCHEDULE_USE_GROUP_ROUTE");
  });
});
