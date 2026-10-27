import { NextResponse, type NextRequest } from "next/server";
import { requireRoleInApi, unauthorizedResponse } from "@/lib/supabase/api-helpers";
import { userCanManagePayroll } from "@/lib/payroll/payroll-access";

type PayrollRouteUser = { id: string; role?: string };

export type ManagePayrollCheckResult =
  | { authorized: true; user: PayrollRouteUser }
  | { authorized: false; response: NextResponse; user?: PayrollRouteUser };

/** Provider staff or owner with payroll access (not freelancer — check separately). */
export async function requireManagePayroll(
  request?: NextRequest | Request,
): Promise<ManagePayrollCheckResult> {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    if (!user) {
      return {
        authorized: false,
        response: unauthorizedResponse("Authentication required"),
      };
    }
    const allowed = await userCanManagePayroll(user.id, request);
    if (!allowed) {
      return {
        authorized: false,
        user,
        response: NextResponse.json(
          {
            error: "Permission denied",
            message: "You do not have permission to manage payroll",
            permission: "manage_payroll",
          },
          { status: 403 },
        ),
      };
    }
    return { authorized: true, user };
  } catch {
    return {
      authorized: false,
      response: unauthorizedResponse("Authentication required"),
    };
  }
}
