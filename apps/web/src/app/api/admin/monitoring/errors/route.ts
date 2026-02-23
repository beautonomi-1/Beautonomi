import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { errorLogger } from "@/lib/monitoring/error-logger";

export async function GET(request: NextRequest) {
  try {
    // Only superadmin can access
    await requireRoleInApi(["superadmin"], request);

    const { searchParams } = new URL(request.url);
    const timeframe = (searchParams.get("timeframe") || "24h") as "24h" | "7d" | "30d";
    const severity = searchParams.get("severity") as "low" | "medium" | "high" | "critical" | undefined;
    const endpoint = searchParams.get("endpoint") || undefined;
    const providerId = searchParams.get("provider_id") || undefined;
    const limit = parseInt(searchParams.get("limit") || "100");

    const stats = await errorLogger.getErrorStats(timeframe);
    
    // Get detailed logs if filters provided
    const logs = await errorLogger.getErrorLogs({
      severity,
      endpoint,
      provider_id: providerId,
      limit,
    });

    return successResponse({
      stats,
      logs,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
