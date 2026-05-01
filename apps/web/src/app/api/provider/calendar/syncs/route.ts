import { NextRequest } from "next/server";
import { forwardSameOrigin } from "@/app/api/provider/calendar/_forward-internal";

/**
 * Legacy alias: older provider Expo builds used `/calendar/syncs` instead of `/calendar/sync`.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.search;
  return forwardSameOrigin(request, `/api/provider/calendar/sync${q}`, "GET");
}
