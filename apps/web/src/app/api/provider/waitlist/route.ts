import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const createWaitlistEntrySchema = z.object({
  customer_name: z.string().min(1),
  customer_email: z.string().email().optional().nullable(),
  customer_phone: z.string().optional().nullable(),
  service_id: z.string().uuid().optional().nullable(),
  staff_id: z.string().uuid().optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  preferred_date: z.string().nullable().optional(),
  preferred_time_start: z.string().nullable().optional(),
  preferred_time_end: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  priority: z.number().optional(),
});

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
    const locationId = searchParams.get("location_id");

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
        location_id,
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

    if (locationId) {
      query = query.eq("location_id", locationId);
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
      location_id: entry.location_id ?? null,
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

/**
 * POST /api/provider/waitlist
 *
 * Provider creates a waitlist entry (e.g. from the portal).
 */
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("create_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = await request.json();
    const parsed = createWaitlistEntrySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        parsed.error.issues
      );
    }

    const row = {
      provider_id: providerId,
      customer_name: parsed.data.customer_name,
      customer_email: parsed.data.customer_email ?? null,
      customer_phone: parsed.data.customer_phone ?? null,
      service_id: parsed.data.service_id ?? null,
      staff_id: parsed.data.staff_id ?? null,
      location_id: parsed.data.location_id ?? null,
      preferred_date: parsed.data.preferred_date ?? null,
      preferred_time_start: parsed.data.preferred_time_start ?? null,
      preferred_time_end: parsed.data.preferred_time_end ?? null,
      notes: parsed.data.notes ?? null,
      status: "waiting" as const,
      priority: parsed.data.priority ?? 0,
    };

    const { data: entry, error: insertError } = await supabase
      .from("waitlist_entries")
      .insert(row)
      .select(
        `
        *,
        offerings:service_id(id, title),
        provider_staff:staff_id(id, name:users(full_name))
      `
      )
      .single();

    if (insertError || !entry) {
      throw insertError || new Error("Failed to create waitlist entry");
    }

    const e = entry as any;
    const transformedEntry = {
      id: e.id,
      customer_id: e.customer_id,
      customer_name: e.customer_name,
      customer_email: e.customer_email,
      customer_phone: e.customer_phone,
      service_id: e.service_id,
      service_name: e.offerings?.title || "",
      staff_id: e.staff_id,
      staff_name: e.provider_staff?.name?.full_name || "",
      preferred_date: e.preferred_date,
      preferred_time: e.preferred_time_start || undefined,
      preferred_time_start: e.preferred_time_start,
      preferred_time_end: e.preferred_time_end,
      notes: e.notes,
      priority: e.priority,
      status: e.status,
      created_at: e.created_at,
      created_date: e.created_at,
      notified_date: e.notified_at,
      location_id: e.location_id ?? null,
    };

    return successResponse(transformedEntry);
  } catch (error) {
    return handleApiError(error, "Failed to create waitlist entry");
  }
}
