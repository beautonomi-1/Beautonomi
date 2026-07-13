import { describe, expect, it } from "vitest";
import {
  getTerminalOrderProgressSteps,
  resolveTerminalOrderPrimaryAction,
} from "../terminal-order-progress";

describe("getTerminalOrderProgressSteps", () => {
  it("marks unpaid courier order as current on Placed", () => {
    const steps = getTerminalOrderProgressSteps({
      order_status: "pending",
      invoice_status: "pending",
      fulfillment_type: "courier",
    });
    expect(steps.map((s) => s.label)).toEqual(["Placed", "Paid", "Delivered"]);
    expect(steps[0].state).toBe("current");
    expect(steps[1].state).toBe("upcoming");
  });

  it("shows Integration step when setup is required and pending", () => {
    const steps = getTerminalOrderProgressSteps({
      order_status: "confirmed",
      invoice_status: "paid",
      fulfillment_type: "digital_activation",
      integration_setup_status: "pending",
    });
    expect(steps.map((s) => s.label)).toEqual(["Placed", "Paid", "Integration", "Activated"]);
    expect(steps.find((s) => s.label === "Integration")?.state).toBe("current");
  });

  it("completes digital activation once paid and setup done", () => {
    const steps = getTerminalOrderProgressSteps({
      order_status: "confirmed",
      invoice_status: "paid",
      fulfillment_type: "digital_activation",
      integration_setup_status: "completed",
    });
    expect(steps.every((s) => s.state === "done" || s.state === "current")).toBe(true);
    expect(steps[steps.length - 1].label).toBe("Activated");
  });

  it("labels collection orders as ready for pickup", () => {
    const steps = getTerminalOrderProgressSteps({
      order_status: "confirmed",
      invoice_status: "paid",
      fulfillment_type: "collection",
    });
    expect(steps[steps.length - 1].label).toBe("Ready for pickup");
    // Paid is the current milestone until the order is fulfilled.
    expect(steps.find((s) => s.label === "Paid")?.state).toBe("current");
    expect(steps[steps.length - 1].state).toBe("upcoming");
  });

  it("marks delivered orders as fully done", () => {
    const steps = getTerminalOrderProgressSteps({
      order_status: "delivered",
      invoice_status: "paid",
      fulfillment_type: "courier",
    });
    expect(steps[steps.length - 1].state).toBe("done");
  });
});

describe("resolveTerminalOrderPrimaryAction", () => {
  it("returns pay for unpaid non-bundle orders", () => {
    expect(
      resolveTerminalOrderPrimaryAction({
        order_status: "pending",
        invoice_status: "pending",
        commercial_model: "once_off_purchase",
      }),
    ).toBe("pay");
  });

  it("never asks bundle orders to pay", () => {
    expect(
      resolveTerminalOrderPrimaryAction({
        order_status: "pending",
        invoice_status: "pending",
        commercial_model: "subscription_bundle",
      }),
    ).toBeNull();
  });

  it("returns setup when integration is pending on a paid order", () => {
    expect(
      resolveTerminalOrderPrimaryAction({
        order_status: "confirmed",
        invoice_status: "paid",
        commercial_model: "once_off_purchase",
        integration_setup_status: "pending",
      }),
    ).toBe("setup");
  });

  it("returns receipt for paid orders without pending setup", () => {
    expect(
      resolveTerminalOrderPrimaryAction({
        order_status: "delivered",
        invoice_status: "paid",
        commercial_model: "once_off_purchase",
        integration_setup_status: "completed",
      }),
    ).toBe("receipt");
  });

  it("returns null for cancelled unpaid orders", () => {
    expect(
      resolveTerminalOrderPrimaryAction({
        order_status: "cancelled",
        invoice_status: "pending",
        commercial_model: "once_off_purchase",
      }),
    ).toBeNull();
  });
});
