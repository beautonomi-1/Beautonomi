import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getLoyaltyPoints } from "@/app/api/me/loyalty-points/route";
import type { LoyaltyPointsPageData } from "./loyalty-points-page-types";

export async function fetchLoyaltyPointsInitial(): Promise<LoyaltyPointsPageData | null> {
  const req = await createNextRequestFromHeaders("/api/me/loyalty-points");
  const res = await getLoyaltyPoints(req);
  const json = (await res.json().catch(() => ({}))) as { data?: LoyaltyPointsPageData };
  if (!res.ok || !json.data) return null;
  return json.data;
}
