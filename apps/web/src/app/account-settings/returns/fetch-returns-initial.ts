import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getReturns } from "@/app/api/me/returns/route";
import type { ReturnRequestListItem } from "./return-list-types";

export async function fetchReturnsInitial(): Promise<ReturnRequestListItem[] | null> {
  const req = await createNextRequestFromHeaders("/api/me/returns");
  const res = await getReturns(req);
  const json = (await res.json().catch(() => ({}))) as { data?: { returns?: ReturnRequestListItem[] } };
  if (!res.ok) return null;
  const returns = json.data?.returns;
  return Array.isArray(returns) ? returns : [];
}
