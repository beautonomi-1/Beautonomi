import { NextResponse } from "next/server";
import { isSecurityChallengeError } from "@beautonomi/auth-security";
import { errorResponse, unauthorizedResponse } from "@/lib/supabase/api-helpers";
import type { PermissionCheckResult } from "@/lib/auth/requirePermission";

export function permissionCheckFromError(err: unknown): PermissionCheckResult {
  if (isSecurityChallengeError(err)) {
    return {
      authorized: false,
      response: errorResponse(err.message, err.code, 403, err.details),
    };
  }
  return {
    authorized: false,
    response: unauthorizedResponse("Authentication required"),
  };
}
