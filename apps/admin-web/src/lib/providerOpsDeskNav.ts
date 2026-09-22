import type { UserRole } from "@beautonomi/types";

export type OpsDesk = "sales" | "onboarding" | "retention";

const MANAGER_ROLES: UserRole[] = ["superadmin", "admin_operations", "admin_support"];

export function isOpsDeskManager(role: UserRole | string | null | undefined): boolean {
  return role != null && MANAGER_ROLES.includes(role as UserRole);
}

export function deskForAdminRole(role: UserRole | string | null | undefined): OpsDesk | null {
  if (role === "admin_sales") return "sales";
  if (role === "admin_onboarding") return "onboarding";
  if (role === "admin_retention") return "retention";
  return null;
}
