import { NextRequest } from "next/server";
import { sendAppointmentReminders, sendRebookReminders } from "@/lib/bookings/appointment-reminders";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const JOB_NAME = "send-reminders";
export const maxDuration = 300;

/**
 * GET /api/cron/send-reminders
 * 
 * Cron job endpoint to send appointment reminders
 * Should be called periodically (e.g., every hour)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron request (secret + Vercel origin)
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    return await runLockedCronRoute(JOB_NAME, async () => {
      const result = await sendAppointmentReminders();
      const rebook = await sendRebookReminders();

      return successResponse({
        message: "Reminders sent successfully",
        ...result,
        ...rebook,
      });
    });
  } catch (error) {
    return handleApiError(error, "Failed to send reminders");
  }
}
