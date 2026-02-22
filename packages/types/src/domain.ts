/**
 * Shared Domain Types
 */

export type UserRole =
  | "customer"
  | "provider_owner"
  | "provider_staff"
  | "superadmin"
  | "support_agent";

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}
