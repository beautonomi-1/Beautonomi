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
import { randomBytes } from "crypto";

const createSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
  is_active: z.boolean().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

function randomSlug() {
  return `cal-${randomBytes(8).toString("hex")}`;
}

/**
 * GET /api/provider/calendar/links
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
      .from("calendar_links")
      .select("*")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return successResponse({ data: data || [] });
  } catch (error) {
    return handleApiError(error, "Failed to list calendar links");
  }
}

/**
 * POST /api/provider/calendar/links
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
    const slug = body.slug || randomSlug();

    const { data, error } = await supabase
      .from("calendar_links")
      .insert({
        provider_id: providerId,
        name: body.name,
        slug,
        is_active: body.is_active ?? true,
        expires_at: body.expires_at ?? null,
        settings: body.settings ?? {},
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return successResponse({ data });
  } catch (error) {
    return handleApiError(error, "Failed to create calendar link");
  }
}
