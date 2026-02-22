import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * POST /api/provider/waitlist/[id]/notify
 * 
 * Send notification to waitlist entry client
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission('send_messages', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify entry belongs to provider and get full details
    const { data: entry, error: fetchError } = await supabase
      .from("waitlist_entries")
      .select(`
        id,
        customer_id,
        customer_name,
        customer_email,
        customer_phone,
        service_id,
        preferred_date,
        preferred_time_start,
        status,
        providers!inner(
          id,
          business_name,
          user_id
        ),
        offerings:service_id(
          id,
          title
        )
      `)
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (fetchError || !entry) {
      return notFoundResponse("Waitlist entry not found");
    }

    // Update status to notified
    const { data: updatedEntry, error: updateError } = await supabase
      .from("waitlist_entries")
      .update({
        status: 'contacted', // Using 'contacted' as equivalent to 'notified'
        notified_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedEntry) {
      throw updateError || new Error("Failed to update waitlist entry");
    }

    // Send notification via OneSignal using template
    try {
      const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
      
      // Determine notification channels based on available contact info
      const channels: ("push" | "email" | "sms")[] = ["push"];
      if (entry.customer_email) {
        channels.push("email");
      }
      if (entry.customer_phone) {
        channels.push("sms");
      }

      // Build template variables
      const serviceName = (entry.offerings as any)?.title || "your requested service";
      const providerName = (entry.providers as any)?.business_name || "the salon";
      const preferredDate = entry.preferred_date 
        ? new Date(entry.preferred_date).toLocaleDateString()
        : "soon";
      const preferredTime = entry.preferred_time_start || "";

      // Send notification using template if customer_id exists
      if (entry.customer_id) {
        const notificationResult = await sendTemplateNotification(
          "booking_waitlist_available",
          [entry.customer_id],
          {
            provider_name: providerName,
            available_date: preferredDate,
            available_time: preferredTime,
            services: serviceName,
            provider_id: providerId,
            waitlist_entry_id: entry.id,
          },
          channels
        );

        if (!notificationResult.success) {
          console.warn("Failed to send waitlist notification:", notificationResult.error);
        }
      } else if (entry.customer_email || entry.customer_phone) {
        // If no customer_id but we have email/phone, log for manual follow-up
        console.log("Waitlist notification would be sent to:", {
          email: entry.customer_email,
          phone: entry.customer_phone,
          provider: providerName,
          service: serviceName,
          date: preferredDate,
        });
      }
    } catch (notificationError) {
      // Log error but don't fail the request
      console.error("Error sending waitlist notification:", notificationError);
    }

    return successResponse({
      success: true,
      message: "Notification sent successfully",
      entry: updatedEntry,
    });
  } catch (error) {
    return handleApiError(error, "Failed to notify waitlist entry");
  }
}
