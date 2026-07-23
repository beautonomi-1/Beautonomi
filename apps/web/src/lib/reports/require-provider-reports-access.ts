import type { NextRequest } from "next/server";
import { requirePermission, type PermissionCheckResult } from "@/lib/auth/requirePermission";

/** Gate provider report APIs to owners/managers with `view_reports`. */
export async function requireProviderReportsAccess(
  request?: NextRequest,
): Promise<PermissionCheckResult> {
  return requirePermission("view_reports", request);
}
