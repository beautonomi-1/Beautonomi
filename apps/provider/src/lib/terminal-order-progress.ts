/**
 * Order progress + primary action helpers for the terminal shop.
 * Mirrors web apps/web/src/lib/terminal/terminal-order-progress.ts.
 * A terminal order moves through: Placed → Paid → (Integration) → Delivered/Activated/Pickup.
 */

export type TerminalOrderProgressInput = {
  order_status: string;
  invoice_status: string;
  fulfillment_type?: string | null;
  fulfillment_status?: string | null;
  integration_setup_status?: string | null;
};

export type TerminalOrderProgressStep = {
  label: string;
  state: "done" | "current" | "upcoming";
};

export function getTerminalOrderProgressSteps(
  order: TerminalOrderProgressInput,
): TerminalOrderProgressStep[] {
  const paid = order.invoice_status === "paid";
  const setupRequired =
    order.integration_setup_status != null && order.integration_setup_status !== "not_required";
  const setupDone = !setupRequired || order.integration_setup_status === "completed";
  const complete =
    order.order_status === "delivered" ||
    order.fulfillment_status === "delivered" ||
    (order.fulfillment_type === "digital_activation" && paid && setupDone);

  const fulfillmentLabel =
    order.fulfillment_type === "collection"
      ? "Ready for pickup"
      : order.fulfillment_type === "digital_activation"
        ? "Activated"
        : "Delivered";

  const steps: Array<{ label: string; reached: boolean; active: boolean }> = [
    { label: "Placed", reached: true, active: !paid },
    { label: "Paid", reached: paid, active: paid && !complete && (!setupRequired || setupDone) },
  ];

  if (setupRequired) {
    steps.push({
      label: "Integration",
      reached: setupDone,
      active: paid && !setupDone,
    });
  }

  steps.push({
    label: fulfillmentLabel,
    reached: complete,
    active: paid && setupDone && !complete,
  });

  let foundCurrent = false;
  return steps.map((step) => {
    if (step.active && !foundCurrent) {
      foundCurrent = true;
      return { label: step.label, state: "current" };
    }
    if (step.reached && !step.active) {
      return { label: step.label, state: "done" };
    }
    if (step.reached && step.active) {
      foundCurrent = true;
      return { label: step.label, state: "current" };
    }
    return { label: step.label, state: "upcoming" };
  });
}

export type TerminalOrderPrimaryAction = "pay" | "setup" | "receipt" | null;

/**
 * Resolve the single most important action for an order card.
 * `blockedStatuses` mirrors each surface's existing "can still pay" rules.
 */
export function resolveTerminalOrderPrimaryAction(
  order: {
    order_status: string;
    invoice_status: string;
    commercial_model: string;
    integration_setup_status?: string | null;
  },
  blockedStatuses: string[] = ["cancelled", "refunded", "failed"],
): TerminalOrderPrimaryAction {
  const paid = order.invoice_status === "paid";
  if (
    !paid &&
    !blockedStatuses.includes(order.order_status) &&
    order.commercial_model !== "subscription_bundle"
  ) {
    return "pay";
  }
  if (order.integration_setup_status === "pending" || order.integration_setup_status === "awaiting_merchant_onboarding") {
    return "setup";
  }
  if (paid) {
    return "receipt";
  }
  return null;
}
