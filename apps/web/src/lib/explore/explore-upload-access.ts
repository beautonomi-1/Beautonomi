import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import { hasPermission } from "@/lib/auth/permissions";
import { requireSocialAccess } from "@/lib/safety/require-social-access";
import { isExploreProviderPostsEnabled } from "@/lib/explore/explore-feature-gates";

export async function requireProviderExploreUploadAccess(request: NextRequest) {
  const { user } = await requireRoleInApi(
    ["provider_owner", "provider_staff", "superadmin"],
    request,
  );
  await requireSocialAccess(user.id, "ugc_create", request);
  const enabled = await isExploreProviderPostsEnabled(null);
  if (!enabled) {
    return { error: errorResponse("Explore posts are disabled", "FORBIDDEN", 403) };
  }
  const supabase = await getSupabaseServer(request);
  const providerId = await getProviderIdForUser(user.id, supabase);
  if (!providerId) {
    return { error: errorResponse("Provider not found", "NOT_FOUND", 404) };
  }

  const supabaseAdmin = await getSupabaseAdmin();
  const isOwner =
    (await supabaseAdmin.from("providers").select("id").eq("user_id", user.id).single()).data !=
    null;

  if (!isOwner) {
    const hasCreatePermission = await hasPermission(
      user.id,
      "create_explore_posts",
      undefined,
      request,
    );
    if (!hasCreatePermission) {
      return {
        error: errorResponse(
          "Permission denied: create_explore_posts required",
          "FORBIDDEN",
          403,
        ),
      };
    }
  }

  return { user, providerId, supabaseAdmin };
}

export function assertExplorePathOwnedByProvider(path: string, providerId: string): boolean {
  const normalized = path.split("?")[0]?.replace(/^\//, "") ?? "";
  return normalized.startsWith(`explore/${providerId}/`) && !normalized.includes("..");
}
