import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, errorResponse, notFoundResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/campaigns/[id]
 * 
 * Get a specific campaign
 */
export async function GET(
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

    const { data: campaign, error } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !campaign) {
      return notFoundResponse("Campaign not found");
    }

    return successResponse(campaign);
  } catch (error: any) {
    console.error("Error fetching campaign:", error);
    return handleApiError(error, "Failed to fetch campaign");
  }
}

/**
 * PATCH /api/provider/campaigns/[id]
 * 
 * Update a campaign
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify campaign belongs to provider and get full data
    const { data: existingCampaign } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingCampaign) {
      return notFoundResponse("Campaign not found");
    }

    // Don't allow editing sent campaigns
    if (existingCampaign.status === "sent") {
      return errorResponse("Cannot edit a sent campaign", "VALIDATION_ERROR", 400);
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.name) updateData.name = body.name;
    if (body.type) updateData.type = body.type;
    if (body.subject !== undefined) updateData.subject = body.subject;
    if (body.content) updateData.content = body.content;
    if (body.recipient_type) updateData.recipient_type = body.recipient_type;
    if (body.recipient_segment !== undefined) updateData.recipient_segment = body.recipient_segment;
    if (body.recipient_ids !== undefined) updateData.recipient_ids = body.recipient_ids;
    if (body.segment_criteria !== undefined) updateData.segment_criteria = body.segment_criteria;
    if (body.scheduled_at !== undefined) {
      updateData.scheduled_at = body.scheduled_at;
      updateData.status = body.scheduled_at ? "scheduled" : "draft";
    }
    if (body.status) updateData.status = body.status;

    // Recalculate total recipients if recipient type or criteria changed
    if (body.recipient_type || body.recipient_ids !== undefined || body.segment_criteria !== undefined) {
      let totalRecipients = 0;
      const recipientType = body.recipient_type || existingCampaign.recipient_type;
      
      if (recipientType === "all_clients") {
        const { count } = await supabase
          .from("provider_clients")
          .select("*", { count: "exact", head: true })
          .eq("provider_id", providerId);
        totalRecipients = count || 0;
      } else if (recipientType === "custom") {
        const recipientIds = body.recipient_ids !== undefined ? body.recipient_ids : existingCampaign.recipient_ids;
        totalRecipients = Array.isArray(recipientIds) ? recipientIds.length : 0;
      } else if (recipientType === "segment") {
        const segmentCriteria = body.segment_criteria !== undefined ? body.segment_criteria : existingCampaign.segment_criteria;
        if (segmentCriteria) {
          // Import the calculateSegmentCount function logic inline
          let segmentQuery = supabase
            .from("provider_clients")
            .select("customer_id", { count: "exact", head: true })
            .eq("provider_id", providerId);

          if (segmentCriteria.min_bookings !== undefined) {
            segmentQuery = segmentQuery.gte("total_bookings", segmentCriteria.min_bookings);
          }
          if (segmentCriteria.max_bookings !== undefined) {
            segmentQuery = segmentQuery.lte("total_bookings", segmentCriteria.max_bookings);
          }
          if (segmentCriteria.min_spent !== undefined) {
            segmentQuery = segmentQuery.gte("total_spent", segmentCriteria.min_spent);
          }
          if (segmentCriteria.max_spent !== undefined) {
            segmentQuery = segmentQuery.lte("total_spent", segmentCriteria.max_spent);
          }
          if (segmentCriteria.is_favorite !== undefined) {
            segmentQuery = segmentQuery.eq("is_favorite", segmentCriteria.is_favorite);
          }
          if (segmentCriteria.tags && segmentCriteria.tags.length > 0) {
            segmentQuery = segmentQuery.overlaps("tags", segmentCriteria.tags);
          }
          if (segmentCriteria.last_booking_days !== undefined) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - segmentCriteria.last_booking_days);
            segmentQuery = segmentQuery.gte("last_service_date", cutoffDate.toISOString());
          }

          const { count } = await segmentQuery;
          totalRecipients = count || 0;
        }
      }
      updateData.total_recipients = totalRecipients;
    }

    const { data: campaign, error } = await supabase
      .from("marketing_campaigns")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(campaign);
  } catch (error: any) {
    console.error("Error updating campaign:", error);
    return handleApiError(error, "Failed to update campaign");
  }
}

/**
 * DELETE /api/provider/campaigns/[id]
 * 
 * Delete a campaign
 */
export async function DELETE(
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

    // Verify campaign belongs to provider
    const { data: existingCampaign } = await supabase
      .from("marketing_campaigns")
      .select("id, status")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingCampaign) {
      return notFoundResponse("Campaign not found");
    }

    // Don't allow deleting sent campaigns
    if (existingCampaign.status === "sent") {
      return errorResponse("Cannot delete a sent campaign", "VALIDATION_ERROR", 400);
    }

    const { error } = await supabase
      .from("marketing_campaigns")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    return successResponse({ message: "Campaign deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting campaign:", error);
    return handleApiError(error, "Failed to delete campaign");
  }
}
