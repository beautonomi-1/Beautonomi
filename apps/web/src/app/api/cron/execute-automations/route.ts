import { NextRequest } from "next/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";

/**
 * GET /api/cron/execute-automations
 * 
 * Cron job endpoint to execute marketing automations
 * Should be called every 5-15 minutes
 * 
 * For Vercel Cron: Add to vercel.json:
 * { "crons": [{ "path": "/api/cron/execute-automations", "schedule": "every 10 minutes" }] }
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron request (secret + Vercel origin)
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    // Call the automation execution endpoint
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : "http://localhost:3000";
    
    const response = await fetch(`${baseUrl}/api/provider/automations/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET || ""}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Automation execution failed: ${errorText}`);
    }

    const result = await response.json();

    return successResponse({
      message: "Automations executed successfully",
      ...result,
    });
  } catch (error) {
    return handleApiError(error, "Failed to execute automations");
  }
}
