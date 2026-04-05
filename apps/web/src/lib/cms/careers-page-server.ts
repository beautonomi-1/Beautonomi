import "server-only";

import { headers } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import {
  DEFAULT_CAREERS_PORTAL_URL,
  DEFAULT_CAREER_META_DESCRIPTION,
  DEFAULT_CAREER_META_TITLE,
  validateCareersPortalUrl,
} from "@/lib/cms/career-cms-constants";

type PageContentRow = {
  content: string | null;
};

async function getHostHeadersRequest(): Promise<Request> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  return new Request("https://tenant-resolve.local/", { headers: { host } });
}

async function fetchCareerSectionContent(
  sectionKey: string,
): Promise<string | null> {
  const supabase = await getSupabaseServer();
  const req = await getHostHeadersRequest();
  const tenant = await resolveTenantFromRequest(req);
  const tenantId = tenant?.id ?? "";

  const { data } = await fetchScopedSingle<PageContentRow>({
    supabase,
    table: "page_content",
    tenantId,
    select: "content",
    apply: (q) =>
      q
        .eq("page_slug", "career")
        .eq("section_key", sectionKey)
        .eq("is_active", true),
    orderBy: { column: "display_order", ascending: true },
  });

  const c = data?.content;
  return typeof c === "string" && c.trim() ? c.trim() : null;
}

export async function getResolvedCareersPortalUrl(): Promise<string> {
  const raw = await fetchCareerSectionContent("careers_portal_url");
  return validateCareersPortalUrl(raw) ?? DEFAULT_CAREERS_PORTAL_URL;
}

export async function getCareerSeoMetadata(): Promise<{
  title: string;
  description: string;
}> {
  const [title, description] = await Promise.all([
    fetchCareerSectionContent("meta_title"),
    fetchCareerSectionContent("meta_description"),
  ]);
  return {
    title: title?.trim() || DEFAULT_CAREER_META_TITLE,
    description: description?.trim() || DEFAULT_CAREER_META_DESCRIPTION,
  };
}
