import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/waitlist
 * Return the current customer's waitlist entries.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer();

    const { data: entries, error } = await supabase
      .from("waitlist_entries")
      .select(
        `
        id,
        provider_id,
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
        updated_at
      `
      )
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return successResponse(entries || []);
  } catch (error) {
    return handleApiError(error, "Failed to load waitlist entries");
  }
}

/**
 * DELETE /api/me/waitlist
 * Remove a waitlist entry by ID.
 * Query param: ?id=<entry_id>
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer();

    const { searchParams } = new URL(request.url);
    const entryId = searchParams.get("id");

    if (!entryId) {
      return handleApiError(
        new Error("id query param is required"),
        "id query param is required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Verify the entry belongs to this customer before deleting
    const { data: entry, error: fetchError } = await supabase
      .from("waitlist_entries")
      .select("id, customer_id")
      .eq("id", entryId)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    if (!entry) {
      return notFoundResponse("Waitlist entry not found");
    }

    const { error } = await supabase
      .from("waitlist_entries")
      .delete()
      .eq("id", entryId)
      .eq("customer_id", user.id);

    if (error) {
      throw error;
    }

    return successResponse({ removed: true, id: entryId });
  } catch (error) {
    return handleApiError(error, "Failed to remove waitlist entry");
  }
}
