import type { NextRequest } from "next/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import type { UsersRoleFromDb } from "@/lib/auth/role";
import {
  type OpsDesk,
  isOpsDeskManager,
  deskForAdminRole,
} from "@/lib/provider-ops/ops-desk-roles";

export async function requireProviderOpsSection(request?: NextRequest | Request) {
  return requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
}

export function assertOpsDeskAccess(
  role: UsersRoleFromDb | string,
  allowedDesks: OpsDesk[],
): void {
  if (isOpsDeskManager(role)) return;
  const desk = deskForAdminRole(role);
  if (!desk || !allowedDesks.includes(desk)) {
    throw new Error(
      `Insufficient permissions: this action requires one of desks: ${allowedDesks.join(", ")}`,
    );
  }
}

export async function requireOpsDesk(
  allowedDesks: OpsDesk[],
  request?: NextRequest | Request,
) {
  const { user } = await requireProviderOpsSection(request);
  assertOpsDeskAccess(user.role, allowedDesks);
  return { user };
}

export async function requireOpsManagers(request?: NextRequest | Request) {
  const { user } = await requireProviderOpsSection(request);
  if (!isOpsDeskManager(user.role)) {
    throw new Error("Insufficient permissions: manager access required");
  }
  return { user };
}
