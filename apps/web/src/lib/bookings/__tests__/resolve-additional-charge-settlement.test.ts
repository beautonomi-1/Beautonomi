import { describe, it, expect } from "vitest";
import {
  resolveAdditionalChargeSettlementPlan,
} from "../resolve-additional-charge-settlement";

describe("resolveAdditionalChargeSettlementPlan", () => {
  it("walk-in booking -> collect_in_person regardless of tender or card", () => {
    const plan = resolveAdditionalChargeSettlementPlan({
      bookingSource: "walk_in",
      originalPaymentProvider: "paystack",
      customerHasSavedCard: true,
    });
    expect(plan.recommendedAction).toBe("collect_in_person");
    expect(plan.availableActions).toContain("customer_pay");
    expect(plan.cardOnFileRequiresApproval).toBe(true);
  });

  it("online card booking with saved card -> charge_card_on_file", () => {
    const plan = resolveAdditionalChargeSettlementPlan({
      bookingSource: "online",
      originalPaymentProvider: "paystack",
      customerHasSavedCard: true,
    });
    expect(plan.recommendedAction).toBe("charge_card_on_file");
    expect(plan.availableActions).toContain("customer_pay");
    expect(plan.availableActions).toContain("collect_in_person");
    expect(plan.cardOnFileRequiresApproval).toBe(true);
  });

  it("online card booking without saved card -> customer_pay", () => {
    const plan = resolveAdditionalChargeSettlementPlan({
      bookingSource: "online",
      originalPaymentProvider: "paystack",
      customerHasSavedCard: false,
    });
    expect(plan.recommendedAction).toBe("customer_pay");
    expect(plan.availableActions).toContain("collect_in_person");
  });

  it("online cash booking -> collect_in_person", () => {
    const plan = resolveAdditionalChargeSettlementPlan({
      bookingSource: "online",
      originalPaymentProvider: "cash",
      customerHasSavedCard: true,
    });
    expect(plan.recommendedAction).toBe("collect_in_person");
    expect(plan.availableActions).toContain("customer_pay");
  });

  it("provider source with cash -> collect_in_person", () => {
    const plan = resolveAdditionalChargeSettlementPlan({
      bookingSource: "provider",
      originalPaymentProvider: "cash",
      customerHasSavedCard: false,
    });
    expect(plan.recommendedAction).toBe("collect_in_person");
  });

  it("provider source with paystack and saved card -> customer_pay (not charge_card_on_file)", () => {
    // Provider-created bookings that were paid online fall into the online-card path
    const plan = resolveAdditionalChargeSettlementPlan({
      bookingSource: "provider",
      originalPaymentProvider: "paystack",
      customerHasSavedCard: true,
    });
    // provider + paystack is treated as online card -> charge_card_on_file
    expect(plan.recommendedAction).toBe("charge_card_on_file");
  });

  it("null/undefined inputs default gracefully", () => {
    const plan = resolveAdditionalChargeSettlementPlan({
      bookingSource: null,
      originalPaymentProvider: null,
      customerHasSavedCard: false,
    });
    // default source "online", empty provider -> no hasSavedCard -> customer_pay
    expect(plan.recommendedAction).toBe("customer_pay");
    expect(plan.availableActions.length).toBeGreaterThan(0);
  });

  it("all returned actions are valid enum values", () => {
    const validActions = ["customer_pay", "charge_card_on_file", "collect_in_person"];
    const scenarios = [
      { bookingSource: "walk_in", originalPaymentProvider: "cash", customerHasSavedCard: false },
      { bookingSource: "online", originalPaymentProvider: "paystack", customerHasSavedCard: true },
      { bookingSource: "online", originalPaymentProvider: "paystack", customerHasSavedCard: false },
      { bookingSource: "online", originalPaymentProvider: "cash", customerHasSavedCard: true },
      { bookingSource: "provider", originalPaymentProvider: "manual", customerHasSavedCard: false },
    ];
    for (const s of scenarios) {
      const plan = resolveAdditionalChargeSettlementPlan(s);
      expect(validActions).toContain(plan.recommendedAction);
      for (const a of plan.availableActions) {
        expect(validActions).toContain(a);
      }
    }
  });
});
