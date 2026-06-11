import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import {
  markRelatedNotificationsReadForUser,
  markRelatedNotificationsReadSchema,
} from "@/lib/notifications/mark-related-notifications-read";
import { syncPushBadgeCountAllApps } from "@/lib/notifications/sync-push-badge-count";
import { invalidateProviderNotificationsListCache } from "@/lib/notifications/provider-notifications-list-cache";

/**
 * POST /api/me/notifications/mark-related-read
 *
 * Mark notification rows read that relate to the opened booking, conversation,
 * order, ticket, or payment (JSON data/metadata or URL match).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const json = await request.json().catch(() => null);
    const parsed = markRelatedNotificationsReadSchema.safeParse(json);
    if (!parsed.success) {
      return errorResponse("Invalid body", "validation_error", 400, parsed.error.flatten());
    }

    const supabase = getSupabaseAdmin();
    const { marked } = await markRelatedNotificationsReadForUser(supabase, user.id, parsed.data);

    void syncPushBadgeCountAllApps(user.id);
    invalidateProviderNotificationsListCache(user.id);

    return successResponse({ success: true, marked });
  } catch (error) {
    return handleApiError(error, "Failed to mark related notifications read");
  }
}
