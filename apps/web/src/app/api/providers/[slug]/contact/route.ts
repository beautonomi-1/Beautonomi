import { NextRequest } from "next/server";
import { getPublicProviderDetail } from "@/lib/data/getPublicProviderDetail";
import {
  customerHasBookedProvider,
  toContactDisclosure,
  type ViewerTier,
} from "@/lib/providers/provider-disclosure";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
  unauthorizedResponse,
} from "@/lib/supabase/api-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/providers/[slug]/contact
 *
 * Authenticated disclosure of provider About, hours, and location contact fields.
 * Tier B (logged in): description, hours, website, socials; area-only locations.
 * Tier C (booked): full address, geo, location phone.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    let user: { id: string };
    try {
      const auth = await requireRoleInApi(
        ["customer", "provider_owner", "provider_staff", "superadmin"],
        request,
      );
      user = auth.user;
    } catch {
      return unauthorizedResponse("Sign in to view provider contact details");
    }

    const { slug: rawSlug } = await params;
    let slugDecoded = rawSlug;
    try {
      slugDecoded = decodeURIComponent(rawSlug);
    } catch {
      slugDecoded = rawSlug;
    }

    const { searchParams } = new URL(request.url);
    const latParam = searchParams.get("lat");
    const lngParam = searchParams.get("lng");
    const userLat = latParam != null ? parseFloat(latParam) : undefined;
    const userLng = lngParam != null ? parseFloat(lngParam) : undefined;

    const { providerFull } = await getPublicProviderDetail(slugDecoded, userLat, userLng);
    if (!providerFull) {
      return notFoundResponse("Provider not found");
    }

    const booked = await customerHasBookedProvider(user.id, providerFull.id);
    const tier: ViewerTier = booked ? "booked" : "authed";
    const payload = toContactDisclosure(providerFull, tier);

    const response = successResponse(payload);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return handleApiError(error, "Failed to load provider contact details");
  }
}
