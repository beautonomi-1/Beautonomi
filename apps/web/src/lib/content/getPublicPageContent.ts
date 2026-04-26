import { createSupabaseAnonPublicClient } from "@/lib/supabase/public-read";

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
    // Static/ISR-safe read path: no request-bound cookies()/headers().
    // These marketing/legal pages should use global CMS rows (tenant_id is null).
    const supabase = createSupabaseAnonPublicClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("page_content")
      .select("section_key, content, content_type, metadata, tenant_id")
      .eq("page_slug", pageSlug)
      .eq("is_active", true)
      .is("tenant_id", null)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;

    const contentMap: PublicPageContent = {};
    for (const row of data || []) {
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
