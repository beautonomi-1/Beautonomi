import { headers } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { fetchScopedListMerged } from "@/lib/tenant/scoped-overrides";
import { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";

export type PublicPageContent = {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, unknown>;
  };
};

export async function getPublicPageContent(
  pageSlug: string
): Promise<PublicPageContent | null> {
  try {
    const supabase = await getSupabaseServer();
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host") || "";
    const tenantReq = new Request("https://tenant-resolve.local/", { headers: { host } });
    const tenant = await resolveTenantFromRequest(tenantReq);
    const tenantId = tenant?.id ?? "";
    const scoped = await fetchScopedListMerged<Record<string, any>>({
      supabase,
      table: "page_content",
      tenantId,
      select: "section_key, content, content_type, metadata",
      apply: (q) => q.eq("page_slug", pageSlug).eq("is_active", true),
      dedupeKey: (row) => String(row.section_key ?? row.id ?? ""),
      orderBy: { column: "display_order", ascending: true },
    });
    const data = scoped.data || [];

    const contentMap: PublicPageContent = {};
    for (const row of data) {
      contentMap[row.section_key] = {
        content: row.content,
        content_type: row.content_type,
        metadata: row.metadata || {},
      };
    }
    return contentMap;
  } catch (error) {
    console.error(`Failed to load public content for ${pageSlug}:`, error);
    return null;
  }
}
