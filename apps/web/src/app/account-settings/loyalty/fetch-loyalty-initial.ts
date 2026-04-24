import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getLoyalty } from "@/app/api/me/loyalty/route";
import type { LoyaltyPageData } from "./loyalty-page-types";

export async function fetchLoyaltyInitial(): Promise<LoyaltyPageData | null> {
  const req = await createNextRequestFromHeaders("/api/me/loyalty");
  const res = await getLoyalty(req);
  const json = (await res.json().catch(() => ({}))) as { data?: LoyaltyPageData };
  if (!res.ok || !json.data) return null;
  return json.data;
}
