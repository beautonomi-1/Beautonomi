import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { invalidateProviderNotificationsListCache } from "@/lib/notifications/provider-notifications-list-cache";
import {
  markRelatedNotificationsReadForUser,
  markRelatedNotificationsReadSchema,
} from "@/lib/notifications/mark-related-notifications-read";
import { syncPushBadgeCountAllApps } from "@/lib/notifications/sync-push-badge-count";

/**
 * POST /api/provider/notifications/mark-related-read
 *
 * Same as `/api/me/notifications/mark-related-read` but scoped to provider routes
 * and invalidates the provider notifications list cache.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const json = await request.json().catch(() => null);
    const parsed = markRelatedNotificationsReadSchema.safeParse(json);
    if (!parsed.success) {
      return errorResponse("Invalid body", "validation_error", 400, parsed.error.flatten());
    }

    const supabase = getSupabaseAdmin();
    const { marked } = await markRelatedNotificationsReadForUser(supabase, user.id, parsed.data);

    invalidateProviderNotificationsListCache(user.id);
    void syncPushBadgeCountAllApps(user.id);

    return successResponse({ success: true, marked });
  } catch (error) {
    return handleApiError(error, "Failed to mark related notifications read");
  }
}
