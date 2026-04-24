import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getRecentlyViewed } from "@/app/api/me/recently-viewed/route";

export type RecentlyViewedProviderRow = {
  id: string;
  slug?: string;
  business_name?: string;
  [key: string]: unknown;
};

export async function fetchRecentlyViewedInitial(): Promise<RecentlyViewedProviderRow[] | null> {
  const req = await createNextRequestFromHeaders("/api/me/recently-viewed");
  const res = await getRecentlyViewed(req);
  if (!res.ok) return null;
  const j = (await res.json().catch(() => ({}))) as { data?: unknown };
  const d = j.data;
  return Array.isArray(d) ? (d as RecentlyViewedProviderRow[]) : [];
}
