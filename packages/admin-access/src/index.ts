/**
 * Single source for admin portal section RBAC (SPA + Next.js).
 * Consumed by apps/admin-web and re-exported from apps/web via @/lib/admin-sections.
 */

import type { UserRole } from "@beautonomi/types";

export const ADMIN_SECTION_OVERVIEW = "overview" as const;
export const ADMIN_SECTION_PROVIDERS_OPERATIONS = "providers_operations" as const;
export const ADMIN_SECTION_FINANCE = "finance" as const;
export const ADMIN_SECTION_USERS_TRUST = "users_trust" as const;
export const ADMIN_SECTION_CONTENT_CATALOG = "content_catalog" as const;
export const ADMIN_SECTION_ECOMMERCE = "ecommerce" as const;
export const ADMIN_SECTION_MARKETING_COMMS = "marketing_comms" as const;
export const ADMIN_SECTION_INTEGRATIONS_DEV = "integrations_dev" as const;
export const ADMIN_SECTION_OPERATIONS = "operations" as const;
export const ADMIN_SECTION_PLATFORM_CONFIG = "platform_config" as const;
export const ADMIN_SECTION_SUPPORT = "support" as const;
export const ADMIN_SECTION_PROVIDER_OPS = "provider_ops" as const;

export type AdminSection =
  | typeof ADMIN_SECTION_OVERVIEW
  | typeof ADMIN_SECTION_SUPPORT
  | typeof ADMIN_SECTION_PROVIDERS_OPERATIONS
  | typeof ADMIN_SECTION_FINANCE
  | typeof ADMIN_SECTION_USERS_TRUST
  | typeof ADMIN_SECTION_CONTENT_CATALOG
  | typeof ADMIN_SECTION_ECOMMERCE
  | typeof ADMIN_SECTION_MARKETING_COMMS
  | typeof ADMIN_SECTION_INTEGRATIONS_DEV
  | typeof ADMIN_SECTION_OPERATIONS
  | typeof ADMIN_SECTION_PLATFORM_CONFIG
  | typeof ADMIN_SECTION_PROVIDER_OPS;

/** Roles that can access the admin shell at all (layout allowedRoles). */
export const ALL_ADMIN_ROLES: UserRole[] = [
  "superadmin",
  "support_agent",
  "admin_support",
  "admin_finance",
  "admin_trust",
  "admin_content",
  "admin_ecommerce",
  "admin_marketing",
  "admin_integrations",
  "admin_operations",
  "admin_platform_config",
];

/** Section -> roles that can access that section. Superadmin is implied everywhere. */
export const ADMIN_SECTION_ROLES: Record<AdminSection, UserRole[]> = {
  [ADMIN_SECTION_OVERVIEW]: ["superadmin", "admin_support"],
  [ADMIN_SECTION_SUPPORT]: ["superadmin", "support_agent", "admin_support"],
  [ADMIN_SECTION_PROVIDERS_OPERATIONS]: ["superadmin", "admin_support"],
  [ADMIN_SECTION_FINANCE]: ["superadmin", "admin_finance"],
  [ADMIN_SECTION_USERS_TRUST]: ["superadmin", "admin_trust"],
  [ADMIN_SECTION_CONTENT_CATALOG]: ["superadmin", "admin_content"],
  [ADMIN_SECTION_ECOMMERCE]: ["superadmin", "admin_ecommerce"],
  [ADMIN_SECTION_MARKETING_COMMS]: ["superadmin", "admin_marketing"],
  [ADMIN_SECTION_INTEGRATIONS_DEV]: ["superadmin", "admin_integrations"],
  [ADMIN_SECTION_OPERATIONS]: ["superadmin", "admin_operations"],
  [ADMIN_SECTION_PLATFORM_CONFIG]: ["superadmin", "admin_platform_config"],
  [ADMIN_SECTION_PROVIDER_OPS]: ["superadmin", "admin_operations", "admin_support"],
};

/** Ordered list of sections (for UI). */
export const ALL_SECTIONS: AdminSection[] = [
  ADMIN_SECTION_OVERVIEW,
  ADMIN_SECTION_SUPPORT,
  ADMIN_SECTION_PROVIDERS_OPERATIONS,
  ADMIN_SECTION_FINANCE,
  ADMIN_SECTION_USERS_TRUST,
  ADMIN_SECTION_CONTENT_CATALOG,
  ADMIN_SECTION_ECOMMERCE,
  ADMIN_SECTION_MARKETING_COMMS,
  ADMIN_SECTION_INTEGRATIONS_DEV,
  ADMIN_SECTION_OPERATIONS,
  ADMIN_SECTION_PLATFORM_CONFIG,
  ADMIN_SECTION_PROVIDER_OPS,
];

/** Display labels for sections (for UI). */
export const SECTION_LABELS: Record<AdminSection, string> = {
  [ADMIN_SECTION_OVERVIEW]: "Overview",
  [ADMIN_SECTION_SUPPORT]: "Support",
  [ADMIN_SECTION_PROVIDERS_OPERATIONS]: "Providers & operations",
  [ADMIN_SECTION_FINANCE]: "Finance",
  [ADMIN_SECTION_USERS_TRUST]: "Users & trust",
  [ADMIN_SECTION_CONTENT_CATALOG]: "Content & catalog",
  [ADMIN_SECTION_ECOMMERCE]: "E-commerce",
  [ADMIN_SECTION_MARKETING_COMMS]: "Marketing & comms",
  [ADMIN_SECTION_INTEGRATIONS_DEV]: "Integrations & dev",
  [ADMIN_SECTION_OPERATIONS]: "Operations",
  [ADMIN_SECTION_PLATFORM_CONFIG]: "Platform config",
  [ADMIN_SECTION_PROVIDER_OPS]: "Provider Ops",
};

/** Admin roles that can be assigned to sections (excludes superadmin; superadmin always has access). */
export const ADMIN_ROLES_FOR_SECTIONS: UserRole[] = [
  "admin_support",
  "admin_finance",
  "admin_trust",
  "admin_content",
  "admin_ecommerce",
  "admin_marketing",
  "admin_integrations",
  "admin_operations",
  "admin_platform_config",
];

/** Display labels for admin roles (for UI). */
export const ROLE_LABELS: Record<string, string> = {
  support_agent: "Support agent",
  admin_support: "Support",
  admin_finance: "Finance",
  admin_trust: "Trust",
  admin_content: "Content",
  admin_ecommerce: "E-commerce",
  admin_marketing: "Marketing",
  admin_integrations: "Integrations",
  admin_operations: "Operations",
  admin_platform_config: "Platform config",
};

export type StoredSectionRoles = Partial<Record<AdminSection, UserRole[]>>;

/**
 * Check if a role can access a section. Optionally pass custom sectionRoles (e.g. from DB);
 * otherwise uses ADMIN_SECTION_ROLES.
 */
export function canAccessSection(
  role: UserRole,
  section: AdminSection,
  sectionRoles?: Record<AdminSection, UserRole[]> | StoredSectionRoles
): boolean {
  if (role === "superadmin") return true;
  const roles = sectionRoles ?? ADMIN_SECTION_ROLES;
  const allowed = roles[section];
  return Array.isArray(allowed) && allowed.includes(role);
}
