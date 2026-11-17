import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { hasPermission } from "@/lib/auth/permissions";
import { redactBookingCustomerContact } from "@/lib/provider/redact-booking-customer-contact";
import {
  mergeWaitlistContact,
  WAITLIST_COLUMNS_WITHOUT_CONTACT,
} from "@/lib/waitlist/waitlist-columns";
import { z } from "zod";

const updateWaitlistSchema = z.object({
  customer_name: z.string().min(1).optional(),
  customer_email: z.string().email().optional(),
  customer_phone: z.string().optional(),
  service_id: z.string().uuid().nullable().optional(),
  staff_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
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
    const canViewClients =
      user.role === "superadmin" ||
      (await hasPermission(user.id, "view_clients", undefined, request));

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: entry, error } = await supabase
      .from("waitlist_entries")
      .select(`
        ${WAITLIST_COLUMNS_WITHOUT_CONTACT},
        offerings:service_id(id, title),
        provider_staff:staff_id(id, name:users(full_name))
      `)
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !entry) {
      return notFoundResponse("Waitlist entry not found");
    }

    const entryRow = entry as unknown as {
      id: string;
      customer_id: string | null;
      customer_name: string | null;
      customer_email?: string | null;
      customer_phone?: string | null;
      service_id: string | null;
      staff_id: string | null;
      preferred_date: string | null;
      preferred_time_start: string | null;
      preferred_time_end: string | null;
      notes: string | null;
      status: string | null;
      priority: number | null;
      created_at: string | null;
      notified_at: string | null;
      location_id?: string | null;
      offerings?: { title?: string | null } | null;
      provider_staff?: { name?: { full_name?: string | null } | null } | null;
    };
    const [visibleEntry] = await mergeWaitlistContact([entryRow], canViewClients);
    const source = visibleEntry ?? entryRow;

    // Transform to match frontend WaitlistEntry type
    const transformedEntry = {
      id: source.id,
      customer_id: source.customer_id,
      customer_name: source.customer_name,
      customer_email: source.customer_email,
      customer_phone: source.customer_phone,
      service_id: source.service_id,
      service_name: (source as any).offerings?.title || "",
      staff_id: source.staff_id,
      staff_name: (source as any).provider_staff?.name?.full_name || "",
      preferred_date: source.preferred_date,
      preferred_time: source.preferred_time_start || undefined,
      preferred_time_start: source.preferred_time_start,
      preferred_time_end: source.preferred_time_end,
      notes: source.notes,
      priority: source.priority === 0 ? "normal" : source.priority > 0 ? "high" : "low",
      status: source.status === "waiting" ? "active" : source.status,
      created_at: source.created_at,
      created_date: source.created_at,
      notified_date: source.notified_at,
      location_id: (source as { location_id?: string | null }).location_id ?? null,
    };

    return successResponse(redactBookingCustomerContact(transformedEntry, canViewClients));
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
    const canViewClients =
      user.role === "superadmin" ||
      (await hasPermission(user.id, "view_clients", undefined, request));

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
        ${WAITLIST_COLUMNS_WITHOUT_CONTACT},
        offerings:service_id(id, title),
        provider_staff:staff_id(id, name:users(full_name))
      `)
      .single();

    if (updateError || !updatedEntry) {
      throw updateError || new Error("Failed to update waitlist entry");
    }

    const [visibleUpdated] = await mergeWaitlistContact([updatedEntry], canViewClients);
    const updated = visibleUpdated ?? updatedEntry;

    // Transform to match frontend WaitlistEntry type
    const transformedEntry = {
      id: updated.id,
      customer_id: updated.customer_id,
      customer_name: updated.customer_name,
      customer_email: updated.customer_email,
      customer_phone: updated.customer_phone,
      service_id: updated.service_id,
      service_name: (updated as any).offerings?.title || "",
      staff_id: updated.staff_id,
      staff_name: (updated as any).provider_staff?.name?.full_name || "",
      preferred_date: updated.preferred_date,
      preferred_time: updated.preferred_time_start || undefined,
      preferred_time_start: updated.preferred_time_start,
      preferred_time_end: updated.preferred_time_end,
      notes: updated.notes,
      priority: updated.priority === 0 ? "normal" : updated.priority > 0 ? "high" : "low",
      status: updated.status === "waiting" ? "active" : updated.status,
      created_at: updated.created_at,
      created_date: updated.created_at,
      notified_date: updated.notified_at,
      location_id: (updated as { location_id?: string | null }).location_id ?? null,
    };

    return successResponse(redactBookingCustomerContact(transformedEntry, canViewClients));
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
