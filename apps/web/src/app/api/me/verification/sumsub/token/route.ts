/**
 * GET /api/me/verification/sumsub/token
 *
 * Returns a SumSub SDK access token for the current customer / user.
 * The SumSub externalUserId is "user:{user.id}" to distinguish from provider
 * applicants ("provider:{provider.id}") in the webhook.
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getSumsubAccessToken } from "@/lib/verification/sumsub-token";
import { createEmbedRefreshToken } from "@/lib/verification/sumsub-embed-refresh";

function parseEnv(s: string | null): string {
  const ENVS = ["production", "staging", "development"];
  if (s && ENVS.includes(s)) return s;
  return "production";
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );

    const { searchParams } = new URL(request.url);
    const environment = parseEnv(searchParams.get("environment"));

    // Use "user:{user.id}" as the SumSub externalUserId so the webhook can
    // distinguish customer applicants from provider ones.
    const sumsubUserId = `user:${user.id}`;

    const { token, levelName } = await getSumsubAccessToken(sumsubUserId, environment);
    if (!token) {
      return errorResponse(
        "Verification is not available yet. Please upload your document manually for now.",
        "SUMSUB_UNAVAILABLE",
        503
      );
    }

    const refresh_token = createEmbedRefreshToken(user.id, environment, "user");

    return successResponse({
      access_token: token,
      refresh_token,
      applicant_id: sumsubUserId,
      level_name: levelName,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to get verification token");
  }
}
