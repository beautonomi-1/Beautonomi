export interface PaycloudTerminalRow {
  id: string;
  display_name: string;
  terminal_sn: string;
  location_id: string | null;
  location_name?: string | null;
  is_active: boolean;
  status?: string;
  source?: string;
  /** Set when a charge is in progress on this terminal (same-session resume). */
  in_flight_payment_id?: string | null;
}

/**
 * Select the best terminal for a booking/sale location.
 * At-salon: location match → portable (null) → first active.
 * At-home: portable (null) → first active.
 */
export function selectTerminalForLocation(
  terminals: PaycloudTerminalRow[],
  bookingLocationId: string | null | undefined,
): { terminal: PaycloudTerminalRow | null; warning?: string } {
  const active = terminals.filter((t) => t.is_active && t.status !== "suspended" && t.status !== "decommissioned");
  if (active.length === 0) return { terminal: null };

  const portable = active.filter((t) => !t.location_id);
  const isMobile = !bookingLocationId;

  if (isMobile) {
    const portableTerminal = portable[0] ?? active[0] ?? null;
    if (!portable[0] && active[0]) {
      return {
        terminal: active[0],
        warning: "No portable card machine set — using another machine.",
      };
    }
    if (!portableTerminal) {
      return { terminal: null, warning: "Add a portable card machine for house calls." };
    }
    return { terminal: portableTerminal };
  }

  const exact = active.find((t) => t.location_id === bookingLocationId);
  if (exact) return { terminal: exact };

  if (portable[0]) {
    return {
      terminal: portable[0],
      warning: "Using your portable card machine — none assigned to this location.",
    };
  }

  const fallback = active[0] ?? null;
  if (fallback) {
    return {
      terminal: fallback,
      warning: "Using a card machine from another location.",
    };
  }
  return { terminal: null };
}
