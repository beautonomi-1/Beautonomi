/**
 * POST /api/me/analytics/identify
 *
 * Server-side endpoint to fetch user properties for Amplitude identification.
 * Used by the AmplitudeProvider client component - avoids importing server-only
 * code (next/headers, getSupabaseServer) in the client bundle.
 */

import { NextRequest } from "next/server";
import {
  successResponse,
  unauthorizedResponse,
  handleApiError,
  requireRoleInApi,
} from "@/lib/supabase/api-helpers";
import { identifyUser } from "@/lib/analytics/amplitude/identify";
import { ALL_ADMIN_ROLES } from "@/lib/admin-sections";
import type { UserRole } from "@/types/beautonomi";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";

/** Any role that may use the web app with Amplitude enabled (admin portal + marketplace). */
const ANALYTICS_IDENTIFY_ROLES: UserRole[] = [
  "customer",
  "provider_owner",
  "provider_staff",
  "support_agent",
  ...ALL_ADMIN_ROLES,
];

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(ANALYTICS_IDENTIFY_ROLES, request);

    const body = await request.json().catch(() => ({}));
    const {
      email,
      full_name,
      phone,
      portal,
      platform,
      device_type,
      app_version,
      app_build,
      os_version,
      device_model,
      first_touch_utm_source,
      first_touch_utm_medium,
      first_touch_utm_campaign,
      first_touch_utm_term,
      first_touch_utm_content,
      first_touch_gclid,
      first_touch_fbclid,
      first_touch_msclkid,
    } = body;

    const activeTenantRow = await resolveTenantFromRequest(request);
    const activeTenant =
      activeTenantRow?.id && activeTenantRow?.slug
        ? { id: activeTenantRow.id, slug: activeTenantRow.slug }
        : null;

    const properties = await identifyUser(
      user.id,
      user.role || "customer",
      { email: user.email || email, full_name: user.full_name || full_name, phone: (user as any).phone || phone },
      activeTenant
    );

    // Merge client-sent attribution (portal, platform, device, app) for proper segmentation
    if (portal != null) properties.portal = String(portal);
    if (platform != null) properties.platform = String(platform);
    if (device_type != null) properties.device_type = String(device_type);
    if (app_version != null) properties.app_version = String(app_version);
    if (app_build != null) properties.app_build = String(app_build);
    if (os_version != null) properties.os_version = String(os_version);
    if (device_model != null) properties.device_model = String(device_model);
    if (first_touch_utm_source != null) properties.first_touch_utm_source = String(first_touch_utm_source);
    if (first_touch_utm_medium != null) properties.first_touch_utm_medium = String(first_touch_utm_medium);
    if (first_touch_utm_campaign != null) properties.first_touch_utm_campaign = String(first_touch_utm_campaign);
    if (first_touch_utm_term != null) properties.first_touch_utm_term = String(first_touch_utm_term);
    if (first_touch_utm_content != null) properties.first_touch_utm_content = String(first_touch_utm_content);
    if (first_touch_gclid != null) properties.first_touch_gclid = String(first_touch_gclid);
    if (first_touch_fbclid != null) properties.first_touch_fbclid = String(first_touch_fbclid);
    if (first_touch_msclkid != null) properties.first_touch_msclkid = String(first_touch_msclkid);

    return successResponse(properties);
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return unauthorizedResponse();
    }
    return handleApiError(error, "Failed to identify user");
  }
}
