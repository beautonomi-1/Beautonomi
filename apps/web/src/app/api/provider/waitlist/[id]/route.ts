import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const updateWaitlistSchema = z.object({
  customer_name: z.string().min(1).optional(),
  customer_email: z.string().email().optional(),
  customer_phone: z.string().optional(),
  service_id: z.string().uuid().nullable().optional(),
  staff_id: z.string().uuid().nullable().optional(),
  preferred_date: z.string().nullable().optional(),
  preferred_time: z.string().nullable().optional(), // Single time field from frontend
  preferred_time_start: z.string().nullable().optional(),
  preferred_time_end: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(['waiting', 'contacted', 'booked', 'cancelled']).optional(),
  priority: z.number().optional(),
});

/**
 * GET /api/provider/waitlist/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission('view_calendar', request);
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

    const { data: entry, error } = await supabase
      .from("waitlist_entries")
      .select(`
        *,
        offerings:service_id(id, title),
        provider_staff:staff_id(id, name:users(full_name))
      `)
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !entry) {
      return notFoundResponse("Waitlist entry not found");
    }

    // Transform to match frontend WaitlistEntry type
    const transformedEntry = {
      id: entry.id,
      customer_id: entry.customer_id,
      customer_name: entry.customer_name,
      customer_email: entry.customer_email,
      customer_phone: entry.customer_phone,
      service_id: entry.service_id,
      service_name: (entry as any).offerings?.title || "",
      staff_id: entry.staff_id,
      staff_name: (entry as any).provider_staff?.name?.full_name || "",
      preferred_date: entry.preferred_date,
      preferred_time: entry.preferred_time_start || undefined,
      preferred_time_start: entry.preferred_time_start,
      preferred_time_end: entry.preferred_time_end,
      notes: entry.notes,
      priority: entry.priority === 0 ? "normal" : entry.priority > 0 ? "high" : "low",
      status: entry.status === "waiting" ? "active" : entry.status,
      created_at: entry.created_at,
      created_date: entry.created_at,
      notified_date: entry.notified_at,
    };

    return successResponse(transformedEntry);
  } catch (error) {
    return handleApiError(error, "Failed to fetch waitlist entry");
  }
}

/**
 * PATCH /api/provider/waitlist/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission('edit_appointments', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    const validationResult = updateWaitlistSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify entry belongs to provider
    const { data: existingEntry } = await supabase
      .from("waitlist_entries")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingEntry) {
      return notFoundResponse("Waitlist entry not found");
    }

    // Map preferred_time to preferred_time_start if provided
    const updateData: any = { ...validationResult.data };
    if (updateData.preferred_time && !updateData.preferred_time_start) {
      updateData.preferred_time_start = updateData.preferred_time;
      delete updateData.preferred_time;
    }
    
    // Update entry
    const { data: updatedEntry, error: updateError } = await (supabase
      .from("waitlist_entries") as any)
      .update(updateData)
      .eq("id", id)
      .select(`
        *,
        offerings:service_id(id, title),
        provider_staff:staff_id(id, name:users(full_name))
      `)
      .single();

    if (updateError || !updatedEntry) {
      throw updateError || new Error("Failed to update waitlist entry");
    }

    // Transform to match frontend WaitlistEntry type
    const transformedEntry = {
      id: updatedEntry.id,
      customer_id: updatedEntry.customer_id,
      customer_name: updatedEntry.customer_name,
      customer_email: updatedEntry.customer_email,
      customer_phone: updatedEntry.customer_phone,
      service_id: updatedEntry.service_id,
      service_name: (updatedEntry as any).offerings?.title || "",
      staff_id: updatedEntry.staff_id,
      staff_name: (updatedEntry as any).provider_staff?.name?.full_name || "",
      preferred_date: updatedEntry.preferred_date,
      preferred_time: updatedEntry.preferred_time_start || undefined,
      preferred_time_start: updatedEntry.preferred_time_start,
      preferred_time_end: updatedEntry.preferred_time_end,
      notes: updatedEntry.notes,
      priority: updatedEntry.priority === 0 ? "normal" : updatedEntry.priority > 0 ? "high" : "low",
      status: updatedEntry.status === "waiting" ? "active" : updatedEntry.status,
      created_at: updatedEntry.created_at,
      created_date: updatedEntry.created_at,
      notified_date: updatedEntry.notified_at,
    };

    return successResponse(transformedEntry);
  } catch (error) {
    return handleApiError(error, "Failed to update waitlist entry");
  }
}

/**
 * DELETE /api/provider/waitlist/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission('edit_appointments', request);
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

    // Verify entry belongs to provider
    const { data: existingEntry } = await supabase
      .from("waitlist_entries")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!existingEntry) {
      return notFoundResponse("Waitlist entry not found");
    }

    const { error: deleteError } = await supabase
      .from("waitlist_entries")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete waitlist entry");
  }
}
