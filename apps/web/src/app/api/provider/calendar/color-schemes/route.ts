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

const createSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
  description: z.string().optional(),
  is_default: z.boolean().optional(),
});

/**
 * GET /api/provider/calendar/color-schemes
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data, error } = await supabase
      .from("calendar_color_schemes")
      .select("*")
      .eq("provider_id", providerId)
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return successResponse({ data: data || [] });
  } catch (error) {
    return handleApiError(error, "Failed to list color schemes");
  }
}

/**
 * POST /api/provider/calendar/color-schemes
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = createSchema.parse(await request.json());

    if (body.is_default) {
      await supabase
        .from("calendar_color_schemes")
        .update({ is_default: false })
        .eq("provider_id", providerId);
    }

    const { data, error } = await supabase
      .from("calendar_color_schemes")
      .insert({
        provider_id: providerId,
        name: body.name,
        color: body.color,
        description: body.description ?? null,
        is_default: body.is_default ?? false,
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return successResponse({ data });
  } catch (error) {
    return handleApiError(error, "Failed to create color scheme");
  }
}
