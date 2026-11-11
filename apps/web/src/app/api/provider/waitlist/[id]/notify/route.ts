import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { hasPermission } from "@/lib/auth/permissions";
import { redactBookingCustomerContact } from "@/lib/provider/redact-booking-customer-contact";
import {
  mergeWaitlistContact,
  WAITLIST_COLUMNS_WITHOUT_CONTACT,
} from "@/lib/waitlist/waitlist-columns";

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
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const canViewClients =
      user.role === "superadmin" ||
      (await hasPermission(user.id, "view_clients", undefined, request));

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

    const [forSend] = await mergeWaitlistContact([entry], true);
    const contact = forSend ?? {
      ...entry,
      customer_email: null as string | null,
      customer_phone: null as string | null,
    };

    // Update status to notified
    const { data: updatedEntry, error: updateError } = await supabase
      .from("waitlist_entries")
      .update({
        status: 'contacted', // Using 'contacted' as equivalent to 'notified'
        notified_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(WAITLIST_COLUMNS_WITHOUT_CONTACT)
      .single();

    if (updateError || !updatedEntry) {
      throw updateError || new Error("Failed to update waitlist entry");
    }

    // Send notification via OneSignal using template
    try {
      const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
      
      // Determine notification channels based on available contact info
      const channels: ("push" | "email" | "sms")[] = ["push"];
      if (contact.customer_email) {
        channels.push("email");
      }
      if (contact.customer_phone) {
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
          channels,
          { appType: "customer" }
        );

        if (!notificationResult.success) {
          console.warn("Failed to send waitlist notification:", notificationResult.error);
        }
      } else if (contact.customer_email || contact.customer_phone) {
        // Guest row has contact, but there is no user to notify. Do not log the address.
        console.warn("Waitlist guest has no customer account; notification was not sent", {
          waitlist_entry_id: entry.id,
        });
      }
    } catch (notificationError) {
      // Log error but don't fail the request
      console.error("Error sending waitlist notification:", notificationError);
    }

    const [visibleUpdated] = await mergeWaitlistContact(
      updatedEntry ? [updatedEntry as unknown as { id: string }] : [],
      canViewClients,
    );
    return successResponse({
      success: true,
      message: "Notification sent successfully",
      entry: redactBookingCustomerContact(visibleUpdated ?? updatedEntry, canViewClients),
    });
  } catch (error) {
    return handleApiError(error, "Failed to notify waitlist entry");
  }
}
