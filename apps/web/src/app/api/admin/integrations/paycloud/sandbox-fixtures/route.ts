import { NextRequest } from "next/server";
import {
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { PAYCLOUD_SANDBOX_FIXTURES } from "@/lib/payments/paycloud-sandbox-fixtures";

/**
 * GET /api/admin/integrations/paycloud/sandbox-fixtures
 * Superadmin-only published PayCloud test values (never bundled in SPA).
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    return successResponse({
      environment: "sandbox" as const,
      ...PAYCLOUD_SANDBOX_FIXTURES,
      app_rsa_private_key: PAYCLOUD_SANDBOX_FIXTURES.app_rsa_private_key_pkcs8,
      notice:
        "Official PayCloud test account — no real money moves. Do not save these values into a live app row.",
    });
  } catch (error) {
    return handleApiError(error, "Failed to load PayCloud sandbox fixtures");
  }
}
