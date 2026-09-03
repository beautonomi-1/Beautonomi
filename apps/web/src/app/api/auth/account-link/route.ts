import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { errorResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { checkSignInRateLimit } from "@/lib/rate-limit/sign-in";
import {
  detectAccountLinkMethods,
  primaryAccountLinkOffer,
  type AccountLinkMethod,
} from "@/lib/auth/account-link";

const GENERIC_OK = {
  methods: [] as AccountLinkMethod[],
  offer: null as null,
};

/**
 * POST /api/auth/account-link
 * After "already registered", look up GoTrue identities and return sign-in offers.
 * Missing users return empty methods (no extra enumeration beyond the signup error).
 */
export async function POST(request: NextRequest) {
  const rateLimit = await checkSignInRateLimit(request);
  if (rateLimit.allowed === false) {
    return errorResponse("Too many attempts. Please try again later.", "RATE_LIMITED", 429);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return successResponse(GENERIC_OK);
    }

    const admin = getSupabaseAdmin();
    const { data: row } = await admin.from("users").select("id").eq("email", email).maybeSingle();
    if (!row?.id) {
      return successResponse(GENERIC_OK);
    }

    const { data, error } = await admin.auth.admin.getUserById(row.id);
    if (error || !data.user) {
      return successResponse(GENERIC_OK);
    }

    const methods = detectAccountLinkMethods(data.user.identities ?? []);
    return successResponse({
      methods,
      offer: primaryAccountLinkOffer(methods),
    });
  } catch (error) {
    return handleApiError(error, "Unable to complete this request.");
  }
}
