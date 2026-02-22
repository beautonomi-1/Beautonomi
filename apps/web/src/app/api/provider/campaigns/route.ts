import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, errorResponse, createPaginatedResponse, getPaginationParams } from "@/lib/supabase/api-helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Calculate the number of recipients matching segment criteria
 */
async function calculateSegmentCount(
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
): Promise<number> {
  let query = supabase
    .from("provider_clients")
    .select("customer_id", { count: "exact", head: true })
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

  const { count, error } = await query;
  if (error) {
    console.error("Error calculating segment count:", error);
    return 0;
  }
  return count || 0;
}

interface _Campaign {
  id: string;
  provider_id: string;
  name: string;
  type: "email" | "sms" | "whatsapp";
  subject?: string;
  content: string;
  recipient_type: "all_clients" | "segment" | "custom";
  recipient_segment?: string;
  recipient_ids?: string[];
  segment_criteria?: {
    min_bookings?: number;
    max_bookings?: number;
    min_spent?: number;
    max_spent?: number;
    last_booking_days?: number;
    tags?: string[];
    is_favorite?: boolean;
  };
  status: "draft" | "scheduled" | "sending" | "sent" | "cancelled";
  scheduled_at?: string;
  sent_at?: string;
  total_recipients: number;
  sent_count: number;
  opened_count?: number;
  clicked_count?: number;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/provider/campaigns
 * 
 * List all campaigns for the provider
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const statusFilter = searchParams.get("status");
    const typeFilter = searchParams.get("type");
    const { page, limit, offset } = getPaginationParams(request);

    let query = supabase
      .from("marketing_campaigns")
      .select("*", { count: "exact" })
      .eq("provider_id", providerId);

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    if (typeFilter) {
      query = query.eq("type", typeFilter);
    }

    query = query.order("created_at", { ascending: false });

    const { data: campaigns, count, error } = await query.range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return createPaginatedResponse(campaigns || [], count || 0, page, limit);
  } catch (error: any) {
    console.error("Error fetching campaigns:", error);
    return handleApiError(error, "Failed to fetch campaigns");
  }
}

/**
 * POST /api/provider/campaigns
 * 
 * Create a new marketing campaign
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const { name, type, subject, content, recipient_type, recipient_segment, recipient_ids, segment_criteria, scheduled_at } = body;

    if (!name || !type || !content || !recipient_type) {
      return errorResponse("Missing required fields: name, type, content, recipient_type", "VALIDATION_ERROR", 400);
    }

    if (!["email", "sms", "whatsapp"].includes(type)) {
      return errorResponse("Invalid campaign type. Must be email, sms, or whatsapp", "VALIDATION_ERROR", 400);
    }

    if (type === "email" && !subject) {
      return errorResponse("Email campaigns require a subject", "VALIDATION_ERROR", 400);
    }

    // Calculate total recipients based on recipient type
    let totalRecipients = 0;
    if (recipient_type === "all_clients") {
      const { count } = await supabase
        .from("provider_clients")
        .select("*", { count: "exact", head: true })
        .eq("provider_id", providerId);
      totalRecipients = count || 0;
    } else if (recipient_type === "custom") {
      if (!recipient_ids || !Array.isArray(recipient_ids) || recipient_ids.length === 0) {
        return errorResponse("Custom recipient list requires at least one recipient", "VALIDATION_ERROR", 400);
      }
      totalRecipients = recipient_ids.length;
    } else if (recipient_type === "segment") {
      if (!segment_criteria || typeof segment_criteria !== "object") {
        return errorResponse("Segment campaigns require segment_criteria", "VALIDATION_ERROR", 400);
      }
      // Calculate segment count using the same logic as send route
      totalRecipients = await calculateSegmentCount(supabase, providerId, segment_criteria);
    }

    const campaignData: any = {
      provider_id: providerId,
      name,
      type,
      subject: subject || null,
      content,
      recipient_type,
      recipient_segment: recipient_segment || null,
      recipient_ids: recipient_ids || null,
      segment_criteria: segment_criteria || null,
      status: scheduled_at ? "scheduled" : "draft",
      scheduled_at: scheduled_at || null,
      total_recipients: totalRecipients,
      sent_count: 0,
      opened_count: 0,
      clicked_count: 0,
    };

    const { data: campaign, error } = await supabase
      .from("marketing_campaigns")
      .insert(campaignData)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return successResponse(campaign, 201);
  } catch (error: any) {
    console.error("Error creating campaign:", error);
    return handleApiError(error, "Failed to create campaign");
  }
}
