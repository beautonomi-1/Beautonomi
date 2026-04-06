/**
 * Shared Domain Types
 */

export type UserRole =
  | "customer"
  | "provider_owner"
  | "provider_staff"
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
