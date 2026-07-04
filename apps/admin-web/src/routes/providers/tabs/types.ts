/** Shared types for provider detail tab components. */

export type TerminalProfileSummary = {
  id?: string;
  tenant_id?: string | null;
  provider_id?: string;
  has_payment_terminal?: boolean | null;
  terminal_ownership_status?: string | null;
  terminal_provider?: string | null;
  terminal_provider_other?: string | null;
  terminal_count_range?: string | null;
  terminal_active_usage_status?: string | null;
  interested_in_platform_terminal?: string | null;
  interested_in_terminal_subscription?: boolean | null;
  source?: string | null;
  updated_at?: string | null;
};

export type ProviderDetail = Record<string, unknown> & {
  is_verified?: boolean;
  slug?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  accept_paystack_terminal?: boolean | null;
  marketing_use_platform_credentials?: boolean | null;
  staff?: unknown[] | null;
  offerings?: unknown[] | null;
  owner?: { id?: string; full_name?: string | null; email?: string | null; phone?: string | null } | null;
  stats?: { booking_count?: number; review_count?: number; average_rating?: number };
  locations?: Record<string, unknown>[];
  terminal_profile?: TerminalProfileSummary | null;
  yoco_summary?: {
    integration?: {
      enabled?: boolean;
      connected_at?: string | null;
      last_sync?: string | null;
      has_public_key?: boolean;
      has_secret_key?: boolean;
      credential_mode?: "none" | "checkout" | "oauth";
      environment?: "sandbox" | "live";
      oauth_token_present?: boolean;
      oauth_token?: {
        expires_at?: string | null;
        refresh_expires_at?: string | null;
        last_refreshed_at?: string | null;
        last_refresh_error?: string | null;
        business_id?: string | null;
        business_name?: string | null;
        user_email?: string | null;
      } | null;
    } | null;
    web_pos_devices?: Record<string, unknown>[];
    legacy_terminals?: Record<string, unknown>[];
    derived?: Record<string, unknown>;
  };
};

export function str(v: unknown): string {
  return v == null ? "" : String(v);
}

export const OWNERSHIP_STATUS_LABELS: Record<string, string> = {
  has_terminal: "Has terminal",
  no_terminal: "No terminal",
  planning_to_get_terminal: "Planning to get one",
  unsure: "Unsure",
};

export const TERMINAL_VENDOR_LABELS: Record<string, string> = {
  yoco: "Yoco",
  ikhokha: "iKhokha",
  capitec: "Capitec",
  fnb: "FNB",
  nedbank: "Nedbank",
  absa: "Absa",
  standard_bank: "Standard Bank",
  psp: "PSP",
  other: "Other",
};
