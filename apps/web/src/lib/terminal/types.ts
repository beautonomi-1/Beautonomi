/**
 * Canonical types for the generic payment terminal capture & commerce feature.
 * These replace the old YocoMachine type from provider onboarding.
 */

export type TerminalOwnershipStatus =
  | "has_terminal"
  | "no_terminal"
  | "planning_to_get_terminal"
  | "unsure";

export type TerminalVendor =
  | "yoco"
  | "ikhokha"
  | "capitec"
  | "fnb"
  | "nedbank"
  | "absa"
  | "standard_bank"
  | "psp"
  | "other"
  | "unsure";

export type TerminalCountRange =
  | "one"
  | "two_to_three"
  | "four_to_ten"
  | "more_than_ten"
  | "unsure";

export type TerminalActiveUsageStatus = "yes" | "no" | "sometimes" | "unsure";

export type TerminalInterestLevel = "yes" | "maybe_later" | "no";

export type TerminalProfileSource =
  | "onboarding"
  | "profile_update"
  | "superadmin_update"
  | "campaign_response";

export interface ProviderPaymentTerminalProfile {
  id: string;
  tenant_id: string;
  provider_id: string;
  has_payment_terminal: boolean | null;
  terminal_ownership_status: TerminalOwnershipStatus | null;
  terminal_provider: TerminalVendor | null;
  terminal_provider_other: string | null;
  terminal_count_range: TerminalCountRange | null;
  terminal_active_usage_status: TerminalActiveUsageStatus | null;
  interested_in_platform_terminal: TerminalInterestLevel | null;
  interested_in_terminal_subscription: boolean | null;
  interested_in_integrated_payments: boolean | null;
  source: TerminalProfileSource;
  captured_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface TerminalProfileUpsert {
  has_payment_terminal?: boolean | null;
  terminal_ownership_status?: TerminalOwnershipStatus | null;
  terminal_provider?: TerminalVendor | null;
  terminal_provider_other?: string | null;
  terminal_count_range?: TerminalCountRange | null;
  terminal_active_usage_status?: TerminalActiveUsageStatus | null;
  interested_in_platform_terminal?: TerminalInterestLevel | null;
  interested_in_terminal_subscription?: boolean | null;
  interested_in_integrated_payments?: boolean | null;
  source?: TerminalProfileSource;
}

/** Labels for the vendor select shown to providers */
export const TERMINAL_VENDOR_LABELS: Record<TerminalVendor, string> = {
  yoco: "Yoco",
  ikhokha: "iKhokha",
  capitec: "Capitec",
  fnb: "FNB",
  nedbank: "Nedbank",
  absa: "Absa",
  standard_bank: "Standard Bank",
  psp: "Payment service provider / PSP",
  other: "Other",
  unsure: "I am not sure",
};

/** Labels for count ranges */
export const TERMINAL_COUNT_RANGE_LABELS: Record<TerminalCountRange, string> = {
  one: "1",
  two_to_three: "2–3",
  four_to_ten: "4–10",
  more_than_ten: "More than 10",
  unsure: "I am not sure",
};

/** Labels for ownership status (primary question options) */
export const TERMINAL_OWNERSHIP_STATUS_LABELS: Record<TerminalOwnershipStatus, string> = {
  has_terminal: "Yes, I have card machines / payment terminals",
  no_terminal: "No, I do not have card machines / payment terminals",
  planning_to_get_terminal: "I am planning to get one",
  unsure: "I am not sure",
};

/** Labels for interest level */
export const TERMINAL_INTEREST_LEVEL_LABELS: Record<TerminalInterestLevel, string> = {
  yes: "Yes",
  maybe_later: "Maybe later",
  no: "No",
};

/** Terminal commerce commercial models (mirrors DB enum) */
export type TerminalCommercialModel =
  | "once_off_purchase"
  | "rental"
  | "subscription_bundle"
  | "lease_to_own"
  | "financed"
  | "promotional";

export const TERMINAL_COMMERCIAL_MODEL_LABELS: Record<TerminalCommercialModel, string> = {
  once_off_purchase: "Once-off purchase",
  rental: "Monthly rental",
  subscription_bundle: "Subscription bundle",
  lease_to_own: "Lease to own",
  financed: "Financed",
  promotional: "Promotional / free",
};

/** Finance transaction types for terminal commerce */
export const TERMINAL_TRANSACTION_TYPES = {
  SALE: "terminal_sale",
  RENTAL: "terminal_rental",
  BUNDLE_ALLOC: "terminal_bundle_alloc",
  PROMOTION: "terminal_promotion",
} as const;
