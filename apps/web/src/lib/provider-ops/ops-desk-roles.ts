import type { UserRole } from "@/types/beautonomi";

export type OpsDesk = "sales" | "onboarding" | "retention";

export const OPS_DESK_MANAGER_ROLES: UserRole[] = [
  "superadmin",
  "admin_operations",
  "admin_support",
];

export const OPS_DESK_SALES_ROLES: UserRole[] = [
  "superadmin",
  "admin_operations",
  "admin_support",
  "admin_sales",
];

export const OPS_DESK_ONBOARDING_ROLES: UserRole[] = [
  "superadmin",
  "admin_operations",
  "admin_support",
  "admin_onboarding",
];

export const OPS_DESK_RETENTION_ROLES: UserRole[] = [
  "superadmin",
  "admin_operations",
  "admin_support",
  "admin_retention",
];

export function deskForAdminRole(role: UserRole | string | null | undefined): OpsDesk | null {
  if (!role) return null;
  if (role === "admin_sales") return "sales";
  if (role === "admin_onboarding") return "onboarding";
  if (role === "admin_retention") return "retention";
  if (OPS_DESK_MANAGER_ROLES.includes(role as UserRole)) return null;
  return null;
}

export function isOpsDeskManager(role: UserRole | string | null | undefined): boolean {
  return role != null && OPS_DESK_MANAGER_ROLES.includes(role as UserRole);
}

export function rolesForDesk(desk: OpsDesk): UserRole[] {
  if (desk === "sales") return OPS_DESK_SALES_ROLES;
  if (desk === "onboarding") return OPS_DESK_ONBOARDING_ROLES;
  return OPS_DESK_RETENTION_ROLES;
}

export const PROVIDER_OPS_SALES_ASSIGNABLE_ROLES: UserRole[] = OPS_DESK_SALES_ROLES;
export const PROVIDER_OPS_ONBOARDING_ASSIGNABLE_ROLES: UserRole[] = OPS_DESK_ONBOARDING_ROLES;
export const PROVIDER_OPS_RETENTION_ASSIGNABLE_ROLES: UserRole[] = OPS_DESK_RETENTION_ROLES;
