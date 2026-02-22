import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/waitlist
 * 
 * Get waitlist entries for provider
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    
    // Use service role client for better performance
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) {
      return successResponse({ entries: [] });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status"); // 'all', 'waiting', 'contacted', 'booked'
    const limit = parseInt(searchParams.get("limit") || "100"); // Default limit of 100

    // Build query - fetch waitlist entries first, then related data separately for better performance
    let query = supabaseAdmin
      .from("waitlist_entries")
      .select(`
        id,
        customer_name,
        customer_email,
        customer_phone,
        service_id,
        staff_id,
        preferred_date,
        preferred_time_start,
        preferred_time_end,
        notes,
        status,
        priority,
        created_at,
        provider_id
      `, { count: "exact" })
      .eq("provider_id", providerId)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(limit);

    // Filter by status
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: entries, error, count } = await query;

    if (error) {
      throw error;
    }

    if (!entries || entries.length === 0) {
      return successResponse({ 
        entries: [],
        total: 0,
      });
    }

    // Fetch related data separately for better performance
    const serviceIds = [...new Set(entries.map((e: any) => e.service_id).filter(Boolean))];
    const staffIds = [...new Set(entries.map((e: any) => e.staff_id).filter(Boolean))];

    const [servicesResult, staffResult] = await Promise.all([
      serviceIds.length > 0
        ? supabaseAdmin
            .from("offerings")
            .select("id, title")
            .in("id", serviceIds)
        : Promise.resolve({ data: [], error: null }),
      staffIds.length > 0
        ? supabaseAdmin
            .from("provider_staff")
            .select("id, name")
            .in("id", staffIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const servicesMap = new Map((servicesResult.data || []).map((s: any) => [s.id, s]));
    const staffMap = new Map((staffResult.data || []).map((s: any) => [s.id, s]));

    // Transform the data to match expected format
    const transformedEntries = entries.map((entry: any) => ({
      id: entry.id,
      customer_name: entry.customer_name,
      customer_email: entry.customer_email,
      customer_phone: entry.customer_phone,
      service_id: entry.service_id,
      staff_id: entry.staff_id,
      preferred_date: entry.preferred_date,
      preferred_time_start: entry.preferred_time_start,
      preferred_time_end: entry.preferred_time_end,
      notes: entry.notes,
      status: entry.status,
      priority: entry.priority,
      created_at: entry.created_at,
      service: entry.service_id && servicesMap.has(entry.service_id)
        ? {
            id: servicesMap.get(entry.service_id)!.id,
            title: servicesMap.get(entry.service_id)!.title,
          }
        : null,
      staff: entry.staff_id && staffMap.has(entry.staff_id)
        ? {
            id: staffMap.get(entry.staff_id)!.id,
            name: staffMap.get(entry.staff_id)!.name,
          }
        : null,
    }));

    return successResponse({ 
      entries: transformedEntries,
      total: count || 0,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch waitlist");
  }
}
