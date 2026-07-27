import type { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  resolveAgeBand,
  readSafetySettingsStored,
  effectiveSafetySettings,
} from "@/lib/age-assurance";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

export interface ViewerSafetyContext {
  restricted: boolean;
  hideSocialFeed: boolean;
  sensitiveContentFilter: boolean;
  hideSponsored: boolean;
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
  };
  if (!userId) return none;

  const tenantId = await resolveTenantIdWithZaFallback(request);
  const supabase = await getSupabaseServer(request);
  const { band } = await resolveAgeBand(userId, supabase);
  const stored = await readSafetySettingsStored(userId, supabase);
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
  };
}
