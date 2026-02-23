import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { healthCheckService } from "@/lib/monitoring/health-check";

export async function GET(request: NextRequest) {
  try {
    // Only superadmin can access
    await requireRoleInApi(["superadmin"], request);

    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get("hours") || "24");

    // Run fresh probes so the dashboard has current data (otherwise metrics stay 0 until provider portal traffic)
    try {
      const origin = new URL(request.url).origin;
      await healthCheckService.runProbes(origin);
    } catch (probeErr) {
      // Don't fail the request if probes fail (e.g. network or table missing)
      console.warn("Monitoring health probes failed:", probeErr);
    }

    const systemHealth = await healthCheckService.getSystemHealth();
    const endpoints = await healthCheckService.getAllEndpointsHealth(hours);

    return successResponse({
      ...systemHealth,
      endpoints,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
