/**
 * POST /api/provider/identity-verification/business-session
 *
 * Creates or reuses a Didit KYB session for registered business providers.
 */

import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import {
  createBusinessVerificationSession,
  IV_ERROR,
} from "@/lib/identity-verification/identity-verification-service";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const supabase = getSupabaseAdmin();

    const { data: providerRow } = await supabase
      .from("providers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    const providerId = (providerRow as { id?: string } | null)?.id ?? null;
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const languageCode = typeof body.language_code === "string" ? body.language_code : undefined;
    const returnTo = typeof body.return_to === "string" ? body.return_to : undefined;

    const result = await createBusinessVerificationSession({
      userId: user.id,
      providerId,
      tenantId: tenantId ?? null,
      languageCode,
      returnTo,
    });

    return successResponse({
      session_id: result.sessionId,
      provider_session_id: result.providerSessionId,
      session_token: result.sessionToken,
      url: result.url,
      is_existing: result.isExisting,
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err) {
      const e = err as { code: string; message: string; statusCode?: number };
      if (
        e.code === IV_ERROR.ALREADY_APPROVED ||
        e.code === "PERSON_KYC_REQUIRED_FIRST" ||
        e.code === "PAYEE_KIND_NOT_BUSINESS"
      ) {
        return errorResponse(e.message, e.code, e.statusCode ?? 409);
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
