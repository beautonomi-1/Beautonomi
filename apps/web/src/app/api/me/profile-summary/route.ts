import { NextRequest } from "next/server";
import { successResponse, handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { GET as getProfileCompletion } from "../profile-completion/route";
import { GET as getProfile } from "../profile/route";
import { GET as getLoyalty } from "../loyalty/route";
import { GET as getVerification } from "../verification/route";
import { GET as getRating } from "../rating/route";

async function readRouteData(res: Response): Promise<unknown> {
  if (!res.ok) return null;
  try {
    const j = (await res.json()) as { data?: unknown };
    return j?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * GET /api/me/profile-summary
 * Aggregates data needed for the customer profile tab in one round trip.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );

    const [compRes, profileRes, loyaltyRes, verifyRes, ratingRes] = await Promise.all([
      getProfileCompletion(request),
      getProfile(request),
      getLoyalty(request),
      getVerification(request),
      getRating(request),
    ]);

    const comp = (await readRouteData(compRes)) as {
      percentage?: number;
      topItems?: { id: string; label: string }[];
      checklistItems?: unknown[];
      avatar_url?: string | null;
    } | null;

    const profileObj = (await readRouteData(profileRes)) as { avatar_url?: string | null } | null;

    const loyalty = (await readRouteData(loyaltyRes)) as {
      points_balance?: number;
      balance?: { available?: number };
      points?: number;
    } | null;

    const verify = (await readRouteData(verifyRes)) as { verified?: boolean } | null;

    const rating = (await readRouteData(ratingRes)) as {
      rating_average?: number;
      review_count?: number;
    } | null;

    const rawLoyalty = loyalty && typeof loyalty === "object" ? loyalty : null;
    const points =
      rawLoyalty?.points_balance ??
      rawLoyalty?.balance?.available ??
      rawLoyalty?.points ??
      0;

    const checklist = Array.isArray(comp?.checklistItems) ? comp!.checklistItems : [];

    return successResponse({
      completion: comp?.percentage ?? 0,
      topItems: comp?.topItems ?? [],
      checklistItems: checklist,
      loyaltyPoints: Number(points) || 0,
      verified: verify?.verified ?? false,
      ratingAverage: Number(rating?.rating_average) || 0,
      reviewCount: Number(rating?.review_count) || 0,
      avatarUrl: profileObj?.avatar_url ?? comp?.avatar_url ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load profile summary");
  }
}
