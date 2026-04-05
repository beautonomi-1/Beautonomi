import { NextRequest } from "next/server";
import { withRouteMetrics } from "@/lib/monitoring/route-metrics";
import { getProviderDashboardResponse } from "@/lib/server/provider/get-provider-dashboard";

export async function GET(request: NextRequest) {
  return withRouteMetrics(request, "/api/provider/dashboard", "GET", () =>
    getProviderDashboardResponse(request),
  );
}
