import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

export interface ReferenceDataItem {
  id: string;
  type: string;
  value: string;
  label: string;
  description?: string;
  display_order: number;
  is_active: boolean;
  metadata: Record<string, any>;
}

export interface ReferenceDataResponse {
  [type: string]: ReferenceDataItem[];
}

/**
 * GET /api/provider/reference-data
 * 
 * Get all reference data for dropdowns and selections.
 * Optionally filter by type using query parameter: ?type=service_type,duration
 * 
 * Available types:
 * - service_type: Service types (basic, package, addon, variant)
 * - duration: Service duration options
 * - price_type: Pricing types (fixed, from, free, varies)
 * - availability: Who can book (everyone, women, men)
 * - tax_rate: Tax rate options
 * - team_role: Team member roles
 * - reminder_unit: Reminder time units (days, weeks, months)
 * - extra_time: Extra/buffer time options
 * - payment_method: Payment methods
 * - booking_status: Booking status options
 * - currency: Currency options
 * - cancellation_reason: Cancellation reasons
 * - discount_type: Discount types
 * - notification_channel: Notification channels
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const typesParam = searchParams.get("type");
    const activeOnly = searchParams.get("active") !== "false"; // Default to active only

    // Build query
    let query = supabase
      .from("reference_data")
      .select("*")
      .order("type")
      .order("display_order", { ascending: true });

    // Filter by active status
    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    // Filter by types if specified
    if (typesParam) {
      const types = typesParam.split(",").map(t => t.trim());
      query = query.in("type", types);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // Group by type for easier consumption
    const groupedData: ReferenceDataResponse = {};
    
    (data || []).forEach((item: ReferenceDataItem) => {
      if (!groupedData[item.type]) {
        groupedData[item.type] = [];
      }
      groupedData[item.type].push({
        id: item.id,
        type: item.type,
        value: item.value,
        label: item.label,
        description: item.description,
        display_order: item.display_order,
        is_active: item.is_active,
        metadata: item.metadata || {},
      });
    });

    return successResponse(groupedData);
  } catch (error) {
    return handleApiError(error, "Failed to fetch reference data");
  }
}
