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
    const { email, full_name, phone, portal, platform, device_type } = body;

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

    // Merge client-sent attribution (portal, platform, device_type) for proper segmentation
    if (portal != null) properties.portal = String(portal);
    if (platform != null) properties.platform = String(platform);
    if (device_type != null) properties.device_type = String(device_type);

    return successResponse(properties);
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return unauthorizedResponse();
    }
    return handleApiError(error, "Failed to identify user");
  }
}
