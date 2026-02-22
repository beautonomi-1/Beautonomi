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

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );

    const body = await request.json().catch(() => ({}));
    const { email, full_name, phone } = body;

    const properties = await identifyUser(
      user.id,
      user.role || "customer",
      { email: user.email || email, full_name: user.full_name || full_name, phone: (user as any).phone || phone }
    );

    return successResponse(properties);
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return unauthorizedResponse();
    }
    return handleApiError(error, "Failed to identify user");
  }
}
