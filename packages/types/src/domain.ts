/**
 * Shared Domain Types
 */

export type UserRole =
  | "customer"
  | "provider_owner"
  | "provider_staff"
  /** Legacy/in-flight role while a provider account completes onboarding. */
  | "provider_onboarding"
  | "superadmin"
  | "support_agent"
  | "admin_support"
  | "admin_finance"
  | "admin_trust"
  | "admin_content"
  | "admin_ecommerce"
  | "admin_marketing"
  | "admin_integrations"
  | "admin_operations"
  | "admin_platform_config";

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

/**
 * Canonical client-facing cancellation policy view — the shape sent from the API
 * to every checkout surface (mobile + web).  Server-side helpers populate this from
 * `cancellation_policies` rows + `providers` no-show fields.
 *
 * NOTE: This type is mirrored in @beautonomi/i18n (cancellation.ts) for use inside
 * the copy builder. Keep both in sync when adding fields.
 */
export interface CancellationPolicyView {
  cancellationWindowHours?: number | null;
  graceWindowMinutes?: number | null;
  lateRefundPercentage?: number | null;
  noShowFeeEnabled?: boolean | null;
  noShowFeeAmount?: number | null;
  currency?: string | null;
  policyText?: string | null;
}
