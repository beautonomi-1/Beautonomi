import type { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  resolveAgeBand,
  readSafetySettingsStored,
  effectiveSafetySettings,
} from "@/lib/age-assurance";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getBlockedUserIds, getMutedUserIds } from "@/lib/safety/user-blocks";

export interface ViewerSafetyContext {
  restricted: boolean;
  hideSocialFeed: boolean;
  sensitiveContentFilter: boolean;
  hideSponsored: boolean;
  blockedUserIds: Set<string>;
  mutedUserIds: Set<string>;
}

export async function getViewerSafetyContext(
  userId: string | null | undefined,
  request: NextRequest,
): Promise<ViewerSafetyContext> {
  const none: ViewerSafetyContext = {
    restricted: false,
    hideSocialFeed: false,
    sensitiveContentFilter: false,
    hideSponsored: false,
    blockedUserIds: new Set(),
    mutedUserIds: new Set(),
  };
  if (!userId) return none;

  const tenantId = await resolveTenantIdWithZaFallback(request);
  const supabase = await getSupabaseServer(request);
  const admin = getSupabaseAdmin();
  const [{ band }, stored, blockedUserIds, mutedUserIds] = await Promise.all([
    resolveAgeBand(userId, supabase),
    readSafetySettingsStored(userId, supabase),
    getBlockedUserIds(userId, admin),
    getMutedUserIds(userId, admin),
  ]);
  const effective = await effectiveSafetySettings(band, stored, tenantId);

  const restricted =
    band === "under_13" ||
    effective.restricted_mode.value ||
    effective.hide_social_feed.value ||
    effective.sensitive_content_filter.value;

  return {
    restricted,
    hideSocialFeed: effective.hide_social_feed.value || band === "under_13",
    sensitiveContentFilter: effective.sensitive_content_filter.value,
    hideSponsored: restricted,
    blockedUserIds,
    mutedUserIds,
  };
}
