import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

type SupabaseLike = any;

export type SelectableTerminal = {
  id: string;
  terminal_code: string;
  name: string | null;
  display_name: string | null;
  active: boolean;
  status: string | null;
  location_id: string | null;
  payment_link: string | null;
  terminal_url: string | null;
  qr_url: string | null;
  poster_url: string | null;
  currency: string | null;
  last_payment_at: string | null;
};

export type PaystackTerminalAvailability = {
  platformEnabled: boolean;
  accepted: boolean;
  /** True when the provider can actually collect with a terminal right now. */
  selectable: boolean;
  terminals: SelectableTerminal[];
  selectableTerminals: SelectableTerminal[];
  activeTerminalCount: number;
};

const TERMINAL_COLUMNS =
  "id, terminal_code, name, display_name, active, status, location_id, payment_link, terminal_url, qr_url, poster_url, currency, last_payment_at";

function isUsableTerminal(terminal: SelectableTerminal): boolean {
  return Boolean(terminal.active) && Boolean(terminal.payment_link || terminal.terminal_url);
}

/**
 * Single source of truth for whether a provider can collect with a Paystack Virtual Terminal.
 * A terminal is "selectable" when the platform flag is on, the provider accepts terminal
 * payments, the terminal is active, and Ops has added a usable payment link/url.
 */
export async function getPaystackTerminalAvailability(params: {
  supabase: SupabaseLike;
  providerId: string;
  tenantId?: string | null;
  accepted?: boolean | null;
}): Promise<PaystackTerminalAvailability> {
  const platformEnabled = await isFeatureEnabledServer(
    FEATURE_FLAG_KEYS.PAYMENT_PAYSTACK_VIRTUAL_TERMINAL,
    params.tenantId ?? null,
  );

  let accepted = params.accepted ?? null;
  if (accepted === null) {
    const { data: provider } = await params.supabase
      .from("providers")
      .select("accept_paystack_terminal")
      .eq("id", params.providerId)
      .maybeSingle();
    accepted = Boolean((provider as { accept_paystack_terminal?: boolean } | null)?.accept_paystack_terminal);
  }

  if (!platformEnabled) {
    return {
      platformEnabled: false,
      accepted: Boolean(accepted),
      selectable: false,
      terminals: [],
      selectableTerminals: [],
      activeTerminalCount: 0,
    };
  }

  const { data: rows } = await (params.supabase
    .from("provider_paystack_virtual_terminals") as any)
    .select(TERMINAL_COLUMNS)
    .eq("provider_id", params.providerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const terminals = (rows ?? []) as SelectableTerminal[];
  const selectableTerminals = terminals.filter(isUsableTerminal);
  const activeTerminalCount = terminals.filter((terminal) => terminal.active).length;

  return {
    platformEnabled: true,
    accepted: Boolean(accepted),
    selectable: Boolean(accepted) && selectableTerminals.length > 0,
    terminals,
    selectableTerminals,
    activeTerminalCount,
  };
}
