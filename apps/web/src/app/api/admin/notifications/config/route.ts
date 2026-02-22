import { NextResponse } from "next/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { verifyOneSignalConfig } from "@/lib/notifications/onesignal";
import { getOneSignalRestApiKey } from "@/lib/platform/secrets";

/**
 * GET /api/admin/notifications/config
 * 
 * Get OneSignal configuration status
 */
export async function GET() {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const config = await verifyOneSignalConfig();
    const restKey = await getOneSignalRestApiKey();

    return NextResponse.json({
      data: {
        configured: config.configured,
        missing: config.missing,
        app_id: config.configured ? process.env.ONESIGNAL_APP_ID : null,
        api_key_configured: !!restKey,
      },
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/notifications/config:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to fetch configuration",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
