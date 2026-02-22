import { NextRequest } from "next/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getPlatformSalesDefaults, getPlatformSalesConstraints } from "@/lib/platform-sales-settings";

/**
 * GET /api/public/platform-sales-defaults
 * 
 * Get platform sales defaults and constraints (public endpoint for providers)
 * This allows providers to see what defaults and constraints are set at platform level
 */
export async function GET(_request: NextRequest) {
  try {
    const [defaults, constraints] = await Promise.all([
      getPlatformSalesDefaults(),
      getPlatformSalesConstraints(),
    ]);

    return successResponse({
      defaults,
      constraints,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load platform sales defaults");
  }
}
