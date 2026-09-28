import { NextRequest } from "next/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { getKpiCatalog } from "@/lib/brand-marketing/kpis";

export async function GET(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;

    const items = getKpiCatalog().map(({ key, label, unit, direction, source, successMetric }) => ({
      key,
      label,
      unit,
      direction,
      source,
      success_metric: successMetric,
    }));
    return successResponse({ items });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to load KPI catalog");
  }
}
