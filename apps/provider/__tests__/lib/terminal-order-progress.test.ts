import {
  getTerminalOrderProgressSteps,
  resolveTerminalOrderPrimaryAction,
} from "@/lib/terminal-order-progress";

describe("getTerminalOrderProgressSteps", () => {
  it("marks unpaid courier order as current on Placed", () => {
    const steps = getTerminalOrderProgressSteps({
      order_status: "pending",
      invoice_status: "pending",
      fulfillment_type: "courier",
    });
    expect(steps.map((s) => s.label)).toEqual(["Placed", "Paid", "Delivered"]);
    expect(steps[0].state).toBe("current");
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

  it("returns setup for paid orders with pending integration", () => {
    expect(
      resolveTerminalOrderPrimaryAction({
        order_status: "confirmed",
        invoice_status: "paid",
        commercial_model: "once_off_purchase",
        integration_setup_status: "pending",
      }),
    ).toBe("setup");
  });

  it("returns null for failed unpaid orders", () => {
    expect(
      resolveTerminalOrderPrimaryAction({
        order_status: "failed",
        invoice_status: "pending",
        commercial_model: "once_off_purchase",
      }),
    ).toBeNull();
  });
});
