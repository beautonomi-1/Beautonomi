import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/supabase/api-helpers";
import { forwardSameOrigin } from "@/app/api/provider/calendar/_forward-internal";

/**
 * Legacy alias: older provider Expo builds POST here instead of GET `/api/provider/calendar/auth/[provider]`.
 * Proxies to the canonical route so clients receive JSON instead of a 404 HTML page.
 */
export async function POST(request: NextRequest) {
  let provider: string;
  try {
    const body = (await request.json()) as { provider?: string };
    provider = String(body?.provider ?? "").trim().toLowerCase();
  } catch {
    return errorResponse("Invalid JSON body", "BAD_REQUEST", 400);
  }
  if (!["google", "apple", "outlook"].includes(provider)) {
    return errorResponse("Invalid provider", "BAD_REQUEST", 400);
  }
  return forwardSameOrigin(request, `/api/provider/calendar/auth/${provider}`, "GET");
}
