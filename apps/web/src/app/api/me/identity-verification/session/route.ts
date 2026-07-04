/**
 * POST /api/me/identity-verification/session
 *
 * Creates or reuses a Didit verification session for the current customer.
 * Returns { session_id, session_token, url, is_existing } — never raw PII.
 *
 * Body (optional):
 *   language_code        string  e.g. "af", "en"
 *   return_to            string  URL to return to after verification
 *   confirmed_legal_details  { first_name, last_name, date_of_birth, country, nationality }
 */

import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { createVerificationSession, IV_ERROR } from "@/lib/identity-verification/identity-verification-service";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const languageCode      = typeof body.language_code === "string" ? body.language_code : undefined;
    const returnTo          = typeof body.return_to      === "string" ? body.return_to     : undefined;
    const rawDetails        = body.confirmed_legal_details as Record<string, string> | undefined;
    const confirmedLegalDetails = rawDetails && rawDetails.first_name && rawDetails.last_name
      ? {
          firstName:   rawDetails.first_name,
          lastName:    rawDetails.last_name,
          dateOfBirth: rawDetails.date_of_birth ?? "",
          country:     rawDetails.country       ?? "",
          nationality: rawDetails.nationality,
        }
      : undefined;

    const result = await createVerificationSession({
      userId:    user.id,
      persona:   "customer",
      tenantId:  tenantId ?? null,
      languageCode,
      returnTo,
      confirmedLegalDetails,
    });

    return successResponse({
      session_id:         result.sessionId,
      provider_session_id:result.providerSessionId,
      session_token:      result.sessionToken,
      url:                result.url,
      is_existing:        result.isExisting,
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err) {
      const e = err as { code: string; message: string; statusCode?: number };
      if (e.code === IV_ERROR.ALREADY_APPROVED) {
        return errorResponse(e.message, e.code, 409);
      }
      if (e.code === IV_ERROR.PROVIDER_UNAVAILABLE) {
        return errorResponse(e.message, e.code, 503);
      }
      if (e.code === IV_ERROR.SESSION_CREATE_FAILED) {
        return errorResponse(e.message, e.code, 502);
      }
    }
    return handleApiError(err);
  }
}
