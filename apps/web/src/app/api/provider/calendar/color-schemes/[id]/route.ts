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
  color: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  is_default: z.boolean().optional(),
});

/**
 * PATCH /api/provider/calendar/color-schemes/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = patchSchema.parse(await request.json());

    if (body.is_default) {
      await supabase
        .from("calendar_color_schemes")
        .update({ is_default: false })
        .eq("provider_id", providerId);
    }

    const { data, error } = await supabase
      .from("calendar_color_schemes")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("provider_id", providerId)
      .select("*")
      .single();

    if (error || !data) {
      return notFoundResponse("Color scheme not found");
    }

    return successResponse({ data });
  } catch (error) {
    return handleApiError(error, "Failed to update color scheme");
  }
}

/**
 * DELETE /api/provider/calendar/color-schemes/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data, error } = await supabase
      .from("calendar_color_schemes")
      .delete()
      .eq("id", id)
      .eq("provider_id", providerId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      return notFoundResponse("Color scheme not found");
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete color scheme");
  }
}
