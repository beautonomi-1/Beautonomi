import { describe, expect, it } from "vitest";
import {
  classifyPaystackDisputePhase,
  normalizePaystackDisputeEventType,
} from "../paystack-dispute-lifecycle";
import { shouldProcessPaystackDisputeChargeback } from "../process-booking-chargeback";

describe("normalizePaystackDisputeEventType", () => {
  it("maps charge.dispute.create to dispute.create", () => {
    expect(normalizePaystackDisputeEventType("charge.dispute.create")).toBe("dispute.create");
  });
});

describe("classifyPaystackDisputePhase", () => {
  it("opens hold on create", () => {
    expect(classifyPaystackDisputePhase("charge.dispute.create", {})).toBe("open_hold");
  });

  it("customer wins when merchant accepted", () => {
    expect(
      classifyPaystackDisputePhase("charge.dispute.resolve", {
        resolution: "merchant-accepted",
      }),
    ).toBe("customer_won");
  });

  it("merchant wins when declined and resolved", () => {
    expect(
      classifyPaystackDisputePhase("dispute.resolve", {
        resolution: "declined",
        status: "resolved",
      }),
    ).toBe("merchant_won");
  });
});

describe("chargeback gate on resolve", () => {
  it("runs only when merchant accepted (customer win)", () => {
    expect(
      shouldProcessPaystackDisputeChargeback("charge.dispute.resolve", {
        resolution: "merchant-accepted",
      }),
    ).toBe(true);
  });
});
