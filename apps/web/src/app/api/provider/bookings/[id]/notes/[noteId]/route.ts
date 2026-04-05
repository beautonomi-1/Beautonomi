import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const patchSchema = z.object({
  content: z.string().min(1).optional(),
  is_internal: z.boolean().optional(),
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
 * PATCH /api/provider/bookings/[id]/notes/[noteId]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const { id: bookingId, noteId } = await params;

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

    const patch = patchSchema.parse(await request.json());

    const { data: updated, error } = await supabase
      .from("booking_notes")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("booking_id", bookingId)
      .eq("provider_id", providerId)
      .select("*")
      .single();

    if (error || !updated) {
      return notFoundResponse("Note not found");
    }

    return successResponse({ note: mapNote(updated, bookingId) });
  } catch (error) {
    return handleApiError(error, "Failed to update booking note");
  }
}

/**
 * DELETE /api/provider/bookings/[id]/notes/[noteId]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const { id: bookingId, noteId } = await params;

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

    const { error, count } = await supabase
      .from("booking_notes")
      .delete({ count: "exact" })
      .eq("id", noteId)
      .eq("booking_id", bookingId)
      .eq("provider_id", providerId);

    if (error) {
      throw error;
    }
    if (!count) {
      return notFoundResponse("Note not found");
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete booking note");
  }
}
