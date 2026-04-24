import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getWaitlist } from "@/app/api/waitlist/route";
import type { WaitlistEntry } from "./waitlist-types";

export async function fetchWaitlistInitial(): Promise<WaitlistEntry[] | null> {
  const req = await createNextRequestFromHeaders("/api/waitlist");
  const res = await getWaitlist(req);
  const json = (await res.json().catch(() => ({}))) as { data?: { entries?: WaitlistEntry[] } };
  if (!res.ok) return null;
  const entries = json.data?.entries;
  return Array.isArray(entries) ? entries : [];
}
