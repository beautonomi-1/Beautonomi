import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const createNoteSchema = z.object({
  content: z.string().min(1),
  is_internal: z.boolean().optional().default(true),
});

function mapNote(row: any, bookingId: string) {
  const created = row.created_at ? new Date(row.created_at).getTime() : 0;
  const updated = row.updated_at ? new Date(row.updated_at).getTime() : 0;
  return {
    id: row.id,
    appointment_id: bookingId,
    type: row.is_internal ? "internal" : "client_visible",
    content: row.content,
    created_by: row.author_id || "",
    created_by_name: row.author_name || "Provider",
    created_date: row.created_at,
    is_edited: updated > created + 1000,
    edited_date: updated > created + 1000 ? row.updated_at : undefined,
  };
}

/**
 * GET /api/provider/bookings/[id]/notes
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("view_calendar", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const { id: bookingId } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .single();

    if (!booking) {
      return notFoundResponse("Booking not found");
    }

    const { data: rows, error } = await supabase
      .from("booking_notes")
      .select("*")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return successResponse({
      notes: (rows || []).map((r) => mapNote(r, bookingId)),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch booking notes");
  }
}

/**
 * POST /api/provider/bookings/[id]/notes
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const { id: bookingId } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .single();

    if (!booking) {
      return notFoundResponse("Booking not found");
    }

    const body = createNoteSchema.parse(await request.json());

    const { data: profile } = await supabase
      .from("users")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    const { data: inserted, error } = await supabase
      .from("booking_notes")
      .insert({
        booking_id: bookingId,
        provider_id: providerId,
        author_id: user.id,
        author_name: (profile as any)?.full_name || "Provider",
        content: body.content,
        is_internal: body.is_internal,
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return successResponse({ note: mapNote(inserted, bookingId) });
  } catch (error) {
    return handleApiError(error, "Failed to create booking note");
  }
}
