import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getAddresses } from "@/app/api/me/addresses/route";
import type { SavedAddress } from "@/hooks/useSavedAddresses";

export async function fetchAddressesInitial(): Promise<SavedAddress[] | null> {
  const req = await createNextRequestFromHeaders("/api/me/addresses");
  const res = await getAddresses(req);
  const json = (await res.json().catch(() => ({}))) as { data?: SavedAddress[] };
  if (!res.ok) return null;
  return Array.isArray(json.data) ? json.data : [];
}
