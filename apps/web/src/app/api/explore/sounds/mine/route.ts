import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  successResponse,
  errorResponse,
  handleApiError,
  requireRoleInApi,
} from "@/lib/supabase/api-helpers";
import { requireSocialAccess } from "@/lib/safety/require-social-access";
import { isExploreSoundCatalogEnabled, isExploreProviderPostsEnabled } from "@/lib/explore/explore-feature-gates";
import { listExploreSoundsForProvider } from "@/lib/explore/list-explore-sounds-for-provider";

const createSchema = z.object({
  title: z.string().min(1).max(120),
  storage_path: z.string().min(1),
  duration_ms: z.number().int().positive().optional(),
});

export async function GET(request: NextRequest) {
  try {
    if (!(await isExploreSoundCatalogEnabled(null))) {
      return successResponse({ data: [] });
    }
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider not found", "NOT_FOUND", 404);

    const supabaseAdmin = await getSupabaseAdmin();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const data = await listExploreSoundsForProvider(supabaseAdmin, providerId, url);
    return successResponse({ data });
  } catch (error) {
    return handleApiError(error, "Failed to list sounds");
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isExploreProviderPostsEnabled(null)) || !(await isExploreSoundCatalogEnabled(null))) {
      return errorResponse("Sound catalog is disabled", "FORBIDDEN", 403);
    }
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    await requireSocialAccess(user.id, "ugc_create", request);
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse("Invalid input", "VALIDATION_ERROR", 400);
    }
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return errorResponse("Provider not found", "NOT_FOUND", 404);

    const path = parsed.data.storage_path.replace(/^\//, "");
    if (!path.startsWith(`explore/${providerId}/`)) {
      return errorResponse("Invalid storage path", "VALIDATION_ERROR", 400);
    }

    const supabaseAdmin = await getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("explore_sounds")
      .insert({
        title: parsed.data.title.trim(),
        owner_type: "provider",
        provider_id: providerId,
        storage_path: path,
        duration_ms: parsed.data.duration_ms ?? null,
      })
      .select("id, title, storage_path, duration_ms")
      .single();

    if (error) return handleApiError(error, "Failed to create sound");
    return successResponse(data, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create sound");
  }
}
