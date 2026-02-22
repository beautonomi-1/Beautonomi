import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, errorResponse, notFoundResponse } from "@/lib/supabase/api-helpers";
import { checkMarketingFeatureAccess, canUseMarketingChannel } from "@/lib/subscriptions/feature-access";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Get recipient IDs matching segment criteria
 */
async function getSegmentRecipients(
  supabase: SupabaseClient<any>,
  providerId: string,
  criteria: {
    min_bookings?: number;
    max_bookings?: number;
    min_spent?: number;
    max_spent?: number;
    last_booking_days?: number;
    tags?: string[];
    is_favorite?: boolean;
  }
): Promise<string[]> {
  let query = supabase
    .from("provider_clients")
    .select("customer_id")
    .eq("provider_id", providerId);

  if (criteria.min_bookings !== undefined) {
    query = query.gte("total_bookings", criteria.min_bookings);
  }
  if (criteria.max_bookings !== undefined) {
    query = query.lte("total_bookings", criteria.max_bookings);
  }
  if (criteria.min_spent !== undefined) {
    query = query.gte("total_spent", criteria.min_spent);
  }
  if (criteria.max_spent !== undefined) {
    query = query.lte("total_spent", criteria.max_spent);
  }
  if (criteria.is_favorite !== undefined) {
    query = query.eq("is_favorite", criteria.is_favorite);
  }
  if (criteria.tags && criteria.tags.length > 0) {
    query = query.overlaps("tags", criteria.tags);
  }
  if (criteria.last_booking_days !== undefined) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - criteria.last_booking_days);
    query = query.gte("last_service_date", cutoffDate.toISOString());
  }

  const { data: clients, error } = await query;
  if (error) {
    console.error("Error getting segment recipients:", error);
    return [];
  }
  return (clients || []).map((c: any) => c.customer_id);
}

/**
 * POST /api/provider/campaigns/[id]/send
 * 
 * Send a campaign immediately or schedule it
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (campaignError || !campaign) {
      return notFoundResponse("Campaign not found");
    }

    // Don't allow sending already sent campaigns
    if (campaign.status === "sent") {
      return errorResponse("Campaign has already been sent", "VALIDATION_ERROR", 400);
    }

    // Check subscription allows this marketing channel
    const canUseChannel = await canUseMarketingChannel(providerId, campaign.type);
    if (!canUseChannel) {
      return errorResponse(
        `${campaign.type === "email" ? "Email" : campaign.type === "sms" ? "SMS" : "WhatsApp"} campaigns require a subscription upgrade. Please upgrade your plan to send ${campaign.type} campaigns.`,
        "SUBSCRIPTION_REQUIRED",
        403
      );
    }

    // Check campaign limits
    const marketingAccess = await checkMarketingFeatureAccess(providerId);
    if (marketingAccess.maxCampaignsPerMonth) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: campaignsThisMonth } = await supabase
        .from("marketing_campaigns")
        .select("id")
        .eq("provider_id", providerId)
        .eq("status", "sent")
        .gte("sent_at", startOfMonth.toISOString());

      if ((campaignsThisMonth?.length || 0) >= marketingAccess.maxCampaignsPerMonth) {
        return errorResponse(
          `You've reached your monthly campaign limit (${marketingAccess.maxCampaignsPerMonth}). Please upgrade your plan to send more campaigns.`,
          "LIMIT_REACHED",
          403
        );
      }
    }

    // Check recipient limit
    if (marketingAccess.maxRecipientsPerCampaign) {
      // We'll check this after getting recipients
    }

    // Get recipients based on recipient type
    let recipientIds: string[] = [];
    
    if (campaign.recipient_type === "all_clients") {
      const { data: clients } = await supabase
        .from("provider_clients")
        .select("customer_id")
        .eq("provider_id", providerId);
      recipientIds = (clients || []).map((c: any) => c.customer_id);
    } else if (campaign.recipient_type === "custom") {
      if (!campaign.recipient_ids || !Array.isArray(campaign.recipient_ids) || campaign.recipient_ids.length === 0) {
        return errorResponse("Custom recipient list is empty", "VALIDATION_ERROR", 400);
      }
      recipientIds = campaign.recipient_ids;
    } else if (campaign.recipient_type === "segment") {
      if (!campaign.segment_criteria) {
        return errorResponse("Segment campaign requires segment_criteria", "VALIDATION_ERROR", 400);
      }
      recipientIds = await getSegmentRecipients(supabase, providerId, campaign.segment_criteria);
    }

    if (recipientIds.length === 0) {
      return errorResponse("No recipients found for this campaign", "VALIDATION_ERROR", 400);
    }

    // Get customer contact information based on campaign type
    const selectFields = campaign.type === "email" 
      ? "id, email" 
      : campaign.type === "whatsapp" || campaign.type === "sms"
      ? "id, phone"
      : "id, email, phone";
    
    const { data: customers } = await supabase
      .from("users")
      .select(selectFields)
      .in("id", recipientIds);

    if (!customers || customers.length === 0) {
      return errorResponse("No valid recipients found", "VALIDATION_ERROR", 400);
    }

    // Filter out customers without required contact info
    const validCustomers = customers.filter((customer: any) => {
      if (campaign.type === "email") {
        return customer.email;
      } else if (campaign.type === "sms" || campaign.type === "whatsapp") {
        return customer.phone;
      }
      return true;
    });

    if (validCustomers.length === 0) {
      return errorResponse(`No recipients have ${campaign.type === "email" ? "email addresses" : "phone numbers"}`, "VALIDATION_ERROR", 400);
    }

    // Check recipient limit per campaign
    if (marketingAccess.maxRecipientsPerCampaign && validCustomers.length > marketingAccess.maxRecipientsPerCampaign) {
      return errorResponse(
        `Campaign exceeds recipient limit (${marketingAccess.maxRecipientsPerCampaign}). Please upgrade your plan to send to more recipients.`,
        "LIMIT_REACHED",
        403
      );
    }

    // Update campaign status
    const { error: updateError } = await supabase
      .from("marketing_campaigns")
      .update({
        status: "sending",
        sent_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      throw updateError;
    }

    // Send marketing campaigns using provider's integrations
    const { sendMessage } = await import("@/lib/marketing/unified-service");
    
    let sentCount = 0;
    let _failedCount = 0;
    const errors: string[] = [];

    // Send to each recipient (cast via unknown - Supabase dynamic select can infer ParserError)
    type CustomerContact = { id: string; email?: string | null; phone?: string | null };
    for (const customer of validCustomers as unknown as CustomerContact[]) {
      try {
        const contact = campaign.type === "email" 
          ? customer.email 
          : customer.phone;

        if (!contact) {
          _failedCount++;
          continue;
        }

        const result = await sendMessage(
          providerId,
          campaign.type,
          {
            to: contact,
            subject: campaign.subject || campaign.name,
            content: campaign.content,
            fromName: campaign.name,
          }
        );

        if (result.success) {
          sentCount++;
        } else {
          _failedCount++;
          if (result.error) {
            errors.push(result.error);
          }
        }
      } catch (error: any) {
        _failedCount++;
        errors.push(error.message || "Unknown error");
      }
    }

    // Update campaign with sent status
    await supabase
      .from("marketing_campaigns")
      .update({
        status: "sent",
        sent_count: sentCount,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Create notifications for recipients (optional)
    const notificationTypeMap: Record<string, string> = {
      email: "marketing_email",
      sms: "marketing_sms",
      whatsapp: "marketing_whatsapp",
    };
    
    const notificationMessageMap: Record<string, string> = {
      email: `You received an email: ${campaign.subject || campaign.name}`,
      sms: `You received an SMS: ${campaign.name}`,
      whatsapp: `You received a WhatsApp message: ${campaign.name}`,
    };

    const notifications = validCustomers.map((customer: any) => ({
      user_id: customer.id,
      type: notificationTypeMap[campaign.type] || "marketing_email",
      title: campaign.name,
      message: notificationMessageMap[campaign.type] || `You received a message: ${campaign.name}`,
      metadata: {
        campaign_id: id,
        type: campaign.type,
      },
    }));

    // Insert notifications in batches
    if (notifications.length > 0) {
      for (let i = 0; i < notifications.length; i += 100) {
        const batch = notifications.slice(i, i + 100);
        await supabase.from("notifications").insert(batch);
      }
    }

    return successResponse({
      message: `Campaign sent to ${sentCount} recipients`,
      sent_count: sentCount,
    });
  } catch (error: any) {
    console.error("Error sending campaign:", error);
    return handleApiError(error, "Failed to send campaign");
  }
}
