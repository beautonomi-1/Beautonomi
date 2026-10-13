/**
 * Shared card-machine selection for Yoco devices and PayCloud terminals.
 */

export type CardMachineProvider = "yoco" | "paycloud";

export type CardMachine = {
  id: string;
  provider: CardMachineProvider;
  name: string;
  locationId: string | null;
  isActive: boolean;
  kind: "web_pos" | "virtual_checkout" | "paycloud_terminal";
  capabilities: {
    apiRefund: boolean;
    tip: boolean;
    cashback: boolean;
    qr: boolean;
    sameDevice: boolean;
  };
  inFlightPaymentId?: string | null;
};

export type SelectDefaultMachineInput = {
  machines: CardMachine[];
  bookingLocationId?: string | null;
  /** PayCloud terminal paired to this device serial */
  pairedMachineId?: string | null;
  defaultMachineId?: string | null;
  lastUsedMachineId?: string | null;
};

export type SelectDefaultMachineResult = {
  machine: CardMachine | null;
  warning?: string;
};

function activeMachines(machines: CardMachine[]): CardMachine[] {
  return machines.filter((m) => m.isActive);
}

/**
 * Location match → portable (null location) → first active.
 * Mirrors PayCloud `selectTerminalForLocation` semantics for both providers.
 */
export function selectDefaultMachine(
  input: SelectDefaultMachineInput,
): SelectDefaultMachineResult {
  const {
    machines,
    bookingLocationId,
    pairedMachineId,
    defaultMachineId,
    lastUsedMachineId,
  } = input;
  const active = activeMachines(machines);
  if (active.length === 0) return { machine: null };

  if (pairedMachineId) {
    const paired = active.find((m) => m.id === pairedMachineId);
    if (paired) return { machine: paired };
  }
  if (defaultMachineId) {
    const def = active.find((m) => m.id === defaultMachineId);
    if (def) return { machine: def };
  }
  if (lastUsedMachineId) {
    const last = active.find((m) => m.id === lastUsedMachineId);
    if (last) return { machine: last };
  }

  const portable = active.filter((m) => !m.locationId);
  const isMobile = !bookingLocationId;

  if (isMobile) {
    const portableMachine = portable[0] ?? active[0] ?? null;
    if (!portable[0] && active[0]) {
      return {
        machine: active[0],
        warning: "No portable card machine set — using another machine.",
      };
    }
    if (!portableMachine) {
      return { machine: null, warning: "Add a portable card machine for house calls." };
    }
    return { machine: portableMachine };
  }

  const exact = active.find((m) => m.locationId === bookingLocationId);
  if (exact) return { machine: exact };

  if (portable[0]) {
    return {
      machine: portable[0],
      warning: "Using your portable card machine — none assigned to this location.",
    };
  }

  const fallback = active[0] ?? null;
  if (fallback) {
    return {
      machine: fallback,
      warning: "Using a card machine from another location.",
    };
  }
  return { machine: null };
}
