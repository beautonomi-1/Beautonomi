import { describe, expect, it } from "vitest";
import {
  buildCustomerTrackingSteps,
  isBookingArrivalVerificationActive,
  isBookingJourneyLive,
} from "./customerTrackingSteps";

describe("buildCustomerTrackingSteps", () => {
  it("repro: cancelled salon unpaid before accept — received + cancelled only", () => {
    const steps = buildCustomerTrackingSteps({
      status: "cancelled",
      locationType: "at_salon",
      currentStage: null,
      hasConfirmedEvent: false,
    });
    expect(steps.map((s) => s.key)).toEqual(["received", "cancelled"]);
    expect(steps.every((s) => s.state === "done")).toBe(true);
    expect(steps[1]?.isTerminal).toBe(true);
    expect(steps.some((s) => s.key === "accepted")).toBe(false);
  });

  it("pending salon — request received is current", () => {
    const steps = buildCustomerTrackingSteps({
      status: "pending",
      locationType: "at_salon",
    });
    expect(steps.find((s) => s.key === "received")?.state).toBe("current");
    expect(steps.find((s) => s.key === "accepted")?.state).toBe("upcoming");
  });

  it("pending_payment salon — accepted not reached", () => {
    const steps = buildCustomerTrackingSteps({
      status: "pending_payment",
      locationType: "at_salon",
    });
    expect(steps.find((s) => s.key === "accepted")?.state).toBe("upcoming");
    expect(steps.find((s) => s.key === "received")?.state).toBe("current");
  });

  it("confirmed salon — booking accepted current", () => {
    const steps = buildCustomerTrackingSteps({
      status: "confirmed",
      locationType: "at_salon",
    });
    expect(steps.find((s) => s.key === "accepted")?.state).toBe("current");
    expect(steps.find((s) => s.key === "received")?.state).toBe("done");
  });

  it("waiting at salon — checked-in step current", () => {
    const steps = buildCustomerTrackingSteps({
      status: "waiting",
      locationType: "at_salon",
    });
    expect(steps.find((s) => s.key === "salonCheckedIn")?.state).toBe("current");
    expect(steps.find((s) => s.key === "accepted")?.state).toBe("done");
  });

  it("checked_in at salon — checked-in step current", () => {
    const steps = buildCustomerTrackingSteps({
      status: "checked_in",
      locationType: "at_salon",
    });
    expect(steps.find((s) => s.key === "salonCheckedIn")?.state).toBe("current");
  });

  it("in_progress salon", () => {
    const steps = buildCustomerTrackingSteps({
      status: "in_progress",
      locationType: "at_salon",
    });
    expect(steps.find((s) => s.key === "inProgress")?.state).toBe("current");
  });

  it("client_arrived stage at salon — checked-in current", () => {
    const steps = buildCustomerTrackingSteps({
      status: "confirmed",
      locationType: "at_salon",
      currentStage: "client_arrived",
    });
    expect(steps.find((s) => s.key === "salonCheckedIn")?.state).toBe("current");
    expect(steps.find((s) => s.key === "accepted")?.state).toBe("done");
  });

  it("completed salon — service complete current", () => {
    const steps = buildCustomerTrackingSteps({
      status: "completed",
      locationType: "at_salon",
    });
    expect(steps.find((s) => s.key === "completed")?.state).toBe("current");
    expect(steps.find((s) => s.key === "inProgress")?.state).toBe("done");
  });

  it("hasConfirmedEvent marks accepted current when status still pending", () => {
    const steps = buildCustomerTrackingSteps({
      status: "pending",
      locationType: "at_salon",
      hasConfirmedEvent: true,
    });
    expect(steps.find((s) => s.key === "received")?.state).toBe("done");
    expect(steps.find((s) => s.key === "accepted")?.state).toBe("current");
  });

  it("cancelled after confirm — accepted done then cancelled terminal", () => {
    const steps = buildCustomerTrackingSteps({
      status: "cancelled",
      locationType: "at_salon",
      currentStage: "confirmed",
      hasConfirmedEvent: true,
    });
    expect(steps.map((s) => s.key)).toEqual(["received", "accepted", "cancelled"]);
  });

  it("no_show after accept — terminal no_show", () => {
    const steps = buildCustomerTrackingSteps({
      status: "no_show",
      locationType: "at_salon",
      currentStage: "confirmed",
    });
    expect(steps[steps.length - 1]?.key).toBe("no_show");
    expect(steps[steps.length - 1]?.terminalKind).toBe("no_show");
  });

  it("at-home provider on way", () => {
    const steps = buildCustomerTrackingSteps({
      status: "confirmed",
      locationType: "at_home",
      currentStage: "provider_on_way",
    });
    expect(steps.find((s) => s.key === "enRoute")?.state).toBe("current");
    expect(steps.find((s) => s.key === "accepted")?.state).toBe("done");
  });

  it("at-home cancelled at provider_arrived — travel steps done, no current", () => {
    const steps = buildCustomerTrackingSteps({
      status: "cancelled",
      locationType: "at_home",
      currentStage: "provider_arrived",
    });
    expect(steps.map((s) => s.key)).toEqual([
      "received",
      "accepted",
      "enRoute",
      "arrived",
      "cancelled",
    ]);
    expect(steps.every((s) => s.state === "done")).toBe(true);
    expect(steps.some((s) => s.state === "current")).toBe(false);
  });

  it("does not treat cancelled as accepted (regression)", () => {
    const steps = buildCustomerTrackingSteps({
      status: "cancelled",
      locationType: "at_salon",
    });
    expect(steps.some((s) => s.key === "accepted")).toBe(false);
  });

  it("cancelled from pending_payment before accept — received + cancelled only", () => {
    const steps = buildCustomerTrackingSteps({
      status: "cancelled",
      locationType: "at_salon",
      currentStage: null,
    });
    expect(steps.map((s) => s.key)).toEqual(["received", "cancelled"]);
  });

  it("legacy started status at salon — in progress current", () => {
    const steps = buildCustomerTrackingSteps({
      status: "started",
      locationType: "at_salon",
    });
    expect(steps.find((s) => s.key === "inProgress")?.state).toBe("current");
  });

  it("at-home provider_arrived — arrived current", () => {
    const steps = buildCustomerTrackingSteps({
      status: "confirmed",
      locationType: "at_home",
      currentStage: "provider_arrived",
      arrivalOtpVerified: false,
    });
    expect(steps.find((s) => s.key === "arrived")?.state).toBe("current");
  });

  it("at-home in_progress — service in progress current", () => {
    const steps = buildCustomerTrackingSteps({
      status: "in_progress",
      locationType: "at_home",
      currentStage: "service_started",
    });
    expect(steps.find((s) => s.key === "inProgress")?.state).toBe("current");
    expect(steps.find((s) => s.key === "enRoute")?.state).toBe("done");
    expect(steps.find((s) => s.key === "arrived")?.state).toBe("done");
  });

  it("at-home completed — all travel steps done", () => {
    const steps = buildCustomerTrackingSteps({
      status: "completed",
      locationType: "at_home",
      currentStage: "service_completed",
    });
    expect(steps.find((s) => s.key === "completed")?.state).toBe("current");
    expect(steps.find((s) => s.key === "arrived")?.state).toBe("done");
  });

  it("no_show without prior accept — received + no_show only", () => {
    const steps = buildCustomerTrackingSteps({
      status: "no_show",
      locationType: "at_salon",
      currentStage: null,
      hasConfirmedEvent: false,
    });
    expect(steps.map((s) => s.key)).toEqual(["received", "no_show"]);
    expect(steps.some((s) => s.key === "accepted")).toBe(false);
  });
});

describe("isBookingJourneyLive", () => {
  it("false for terminal statuses", () => {
    expect(isBookingJourneyLive({ status: "cancelled" })).toBe(false);
    expect(isBookingJourneyLive({ status: "no_show" })).toBe(false);
    expect(isBookingJourneyLive({ status: "completed" })).toBe(false);
  });

  it("true for active confirmed", () => {
    expect(isBookingJourneyLive({ status: "confirmed", locationType: "at_home" })).toBe(true);
  });
});

describe("isBookingArrivalVerificationActive", () => {
  it("true at provider_arrived when live", () => {
    expect(
      isBookingArrivalVerificationActive({
        status: "confirmed",
        locationType: "at_home",
        currentStage: "provider_arrived",
        arrivalOtpVerified: false,
      }),
    ).toBe(true);
  });

  it("false when cancelled", () => {
    expect(
      isBookingArrivalVerificationActive({
        status: "cancelled",
        locationType: "at_home",
        currentStage: "provider_arrived",
      }),
    ).toBe(false);
  });
});
