/**
 * POST /api/admin/control-plane/integrations/sumsub/test
 *
 * Mints a throwaway Sumsub SDK token to validate that the stored credentials
 * and level_name are correct for the given environment and scope.
 *
 * Returns { ok, level_name, error? } — never returns the token itself.
 * Guards are identical to the parent route (ADMIN_SECTION_PLATFORM_CONFIG).
 */

import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { getSumsubAccessToken } from "@/lib/verification/sumsub-token";
import { resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";
import { randomUUID } from "crypto";

const ENVS = ["production", "staging", "development"];

function parseEnv(s: string | null): string {
  if (s && ENVS.includes(s)) return s;
  return "production";
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const body = await request.json();
    const environment = parseEnv(body.environment ?? null);

    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(
      request,
      body as Record<string, unknown>,
      user.role ?? null,
    );
    const scopeTenantId =
      requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    // Use a stable throwaway applicant id so Sumsub doesn't accumulate
    // real applicant rows from admin config tests.
    const testApplicantId = `cp-test-${randomUUID()}`;

    const { token, levelName, error } = await getSumsubAccessToken(
      testApplicantId,
      environment,
      scopeTenantId,
    );

    if (!token) {
      return successResponse({
        ok: false,
        level_name: levelName,
        error: error ?? "Token mint failed — check credentials and level name.",
      });
    }

    return successResponse({ ok: true, level_name: levelName });
  } catch (error) {
    return handleApiError(error as Error, "Failed to test Sumsub token");
  }
}
