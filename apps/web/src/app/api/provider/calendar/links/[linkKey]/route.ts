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
  name: z.string().min(1).optional(),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
  is_active: z.boolean().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

/**
 * PATCH /api/provider/calendar/links/[linkKey] — linkKey is the row UUID.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ linkKey: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const { linkKey: id } = await params;
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = patchSchema.parse(await request.json());

    const { data, error } = await supabase
      .from("calendar_links")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("provider_id", providerId)
      .select("*")
      .single();

    if (error || !data) {
      return notFoundResponse("Calendar link not found");
    }

    return successResponse({ data });
  } catch (error) {
    return handleApiError(error, "Failed to update calendar link");
  }
}

/**
 * DELETE /api/provider/calendar/links/[linkKey] — linkKey is the row UUID.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ linkKey: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const { linkKey: id } = await params;
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data, error } = await supabase
      .from("calendar_links")
      .delete()
      .eq("id", id)
      .eq("provider_id", providerId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      return notFoundResponse("Calendar link not found");
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete calendar link");
  }
}
