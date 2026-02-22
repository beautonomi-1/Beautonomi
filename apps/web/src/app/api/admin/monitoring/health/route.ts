import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { healthCheckService } from "@/lib/monitoring/health-check";

export async function GET(request: NextRequest) {
  try {
    // Only superadmin can access
    await requireRoleInApi(["superadmin"]);

    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get("hours") || "24");

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
