import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getProviderServices } from "@/app/api/public/providers/[slug]/services/route";
import type { PartnerProfileServiceCategoryInitial } from "@/types/partner-profile-services";

/**
 * Same payload as GET /api/public/providers/[slug]/services (in-process, no HTTP).
 * Loaded in parallel with getPublicProviderDetail so the Services tab is ready on first paint.
 */
export async function fetchPublicProviderServicesInitial(
  slug: string,
): Promise<PartnerProfileServiceCategoryInitial[] | null> {
  if (!slug?.trim()) return null;
  try {
    const path = `/api/public/providers/${encodeURIComponent(slug)}/services`;
    const req = await createNextRequestFromHeaders(path);
    const res = await getProviderServices(req, { params: Promise.resolve({ slug }) });
    const json = (await res.json()) as { data?: { categories?: PartnerProfileServiceCategoryInitial[] } };
    if (!res.ok || !json?.data?.categories) return null;
    return json.data.categories;
  } catch (e) {
    console.warn("fetchPublicProviderServicesInitial:", e);
    return null;
  }
}
