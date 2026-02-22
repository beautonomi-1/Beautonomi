import { NextRequest } from "next/server";
import { checkLowStockAndAlert } from "@/lib/inventory/stock-alerts";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";

/**
 * GET /api/cron/check-low-stock
 * 
 * Cron job endpoint to check for low stock products and send alerts
 * Should be called periodically (e.g., daily)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron request (secret + Vercel origin)
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const result = await checkLowStockAndAlert();

    return successResponse({
      message: "Low stock check completed",
      ...result,
    });
  } catch (error) {
    return handleApiError(error, "Failed to check low stock");
  }
}
