import { getSupabasePublicAnon } from "@/lib/supabase/public-anon";

export type LearnCategoryRow = {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  audience: string;
  parent_id: string | null;
};

export type LearnTreeNode = LearnCategoryRow & { children: LearnTreeNode[] };

export type LearnHomePayload = {
  hero: { title: string; subtitle: string };
  cta_cards: { cards: Array<{ title: string; description: string; icon: string; link: string }> };
  platform_guides: {
    tabs: Array<{
      id: "web" | "mobile";
      label: string;
      description: string;
      groups: Array<{
        title: string;
        audience: "customer" | "provider";
        cards: Array<{
          title: string;
          description: string;
          href: string;
        }>;
      }>;
    }>;
  };
  featured_articles: Array<{
    id: string;
    title: string;
    slug: string;
    summary: string | null;
    learning_categories?: { slug: string } | null;
  }>;
  video_library: { title: string; videos: unknown[] };
  platform_updates: {
    title: string;
    article_ids: string[];
    articles?: Array<{ id: string; title: string; slug: string; summary: string | null }>;
  };
};

function buildTree(items: LearnCategoryRow[], parentId: string | null = null): LearnTreeNode[] {
  return items
    .filter((c) => (c.parent_id ?? null) === parentId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({ ...c, children: buildTree(items, c.id) }));
}

async function fetchLearnCategoryRows(audience: string | null): Promise<LearnCategoryRow[]> {
  const supabase = getSupabasePublicAnon();
  let query = supabase
    .from("learning_categories")
    .select("id, title, slug, icon, sort_order, audience, parent_id")
    .is("tenant_id", null)
    .eq("visibility", "public")
    .order("sort_order", { ascending: true });

  if (audience && ["general", "customer", "provider"].includes(audience)) {
    query = query.or(`audience.eq.${audience},audience.eq.general`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("fetchLearnCategoryRows:", error);
    return [];
  }
  return (data ?? []) as LearnCategoryRow[];
}

/** Same as GET /api/public/learn/tree */
export async function getPublicLearnTree(audience: string | null = null): Promise<LearnTreeNode[]> {
  try {
    const list = await fetchLearnCategoryRows(audience);
    return buildTree(list);
  } catch (e) {
    console.error("getPublicLearnTree:", e);
    return [];
  }
}

/** Same as GET /api/public/learn/categories */
export async function getPublicLearnCategoriesFlat(audience: string | null = null): Promise<LearnCategoryRow[]> {
  try {
    return await fetchLearnCategoryRows(audience);
  } catch (e) {
    console.error("getPublicLearnCategoriesFlat:", e);
    return [];
  }
}

/**
 * Sidebar: prefer hierarchical tree when non-empty; otherwise flat category list.
 * Mirrors client logic that called /tree then /categories.
 */
export async function getLearnSidebarPayload(): Promise<{
  tree: LearnTreeNode[] | null;
  categories: Pick<LearnCategoryRow, "id" | "title" | "slug" | "audience">[];
}> {
  const tree = await getPublicLearnTree(null);
  if (tree.length > 0) {
    return { tree, categories: [] };
  }
  const rows = await getPublicLearnCategoriesFlat(null);
  return {
    tree: null,
    categories: rows.map(({ id, title, slug, audience }) => ({ id, title, slug, audience })),
  };
}

/** Same as GET /api/public/learn/home */
export async function getPublicLearnHome(): Promise<LearnHomePayload> {
  const supabase = getSupabasePublicAnon();

  const { data: sections } = await supabase
    .from("learning_homepage_sections")
    .select("section_key, payload")
    .is("tenant_id", null)
    .in("section_key", ["hero", "cta_cards", "platform_guides", "featured_articles", "video_library", "platform_updates"]);

  const out: LearnHomePayload = {
    hero: { title: "Learning Center", subtitle: "Find guides and answers." },
    cta_cards: { cards: [] },
    platform_guides: {
      tabs: [
        {
          id: "web",
          label: "Web",
          description: "Use Beautonomi in a browser on desktop or mobile web.",
          groups: [
            {
              title: "Customers",
              audience: "customer",
              cards: [
                {
                  title: "Book on the web",
                  description: "Find providers, book services, pay, and manage appointments.",
                  href: "/learn/article/customer-web-booking",
                },
              ],
            },
            {
              title: "Providers",
              audience: "provider",
              cards: [
                {
                  title: "Provider web portal",
                  description: "Manage bookings, finance, Yoco, memberships, packages, and settings.",
                  href: "/learn/article/provider-web-portal",
                },
              ],
            },
          ],
        },
        {
          id: "mobile",
          label: "Mobile app",
          description: "Use Beautonomi from the customer or provider app.",
          groups: [
            {
              title: "Customers",
              audience: "customer",
              cards: [
                {
                  title: "Customer app guide",
                  description: "Understand tabs, bookings, payments, notifications, and support.",
                  href: "/learn/article/customer-mobile-app",
                },
              ],
            },
            {
              title: "Providers",
              audience: "provider",
              cards: [
                {
                  title: "Provider app guide",
                  description: "Use More, calendar, Yoco payments, finance, settings, and support.",
                  href: "/learn/article/provider-mobile-app",
                },
              ],
            },
          ],
        },
      ],
    },
    featured_articles: [],
    video_library: { title: "Video Library", videos: [] },
    platform_updates: { title: "Platform Updates", article_ids: [], articles: [] },
  };

  for (const s of sections ?? []) {
    const key = s.section_key as keyof LearnHomePayload;
    if (key in out && s.payload) {
      (out as Record<string, unknown>)[key] = s.payload;
    }
  }

  const featuredPayload = out.featured_articles as unknown;
  const featuredIds = Array.isArray(featuredPayload)
    ? []
    : ((featuredPayload as { article_ids?: string[] })?.article_ids ?? []);

  if (featuredIds.length > 0) {
    const { data: articles } = await supabase
      .from("learning_articles")
      .select("id, title, slug, summary, image_url, learning_categories(slug)")
      .in("id", featuredIds)
      .is("tenant_id", null)
      .eq("status", "published")
      .eq("is_internal", false);
    out.featured_articles = (articles ?? []) as unknown as LearnHomePayload["featured_articles"];
  } else {
    out.featured_articles = [];
  }

  const updateIds = out.platform_updates?.article_ids ?? [];
  if (updateIds.length > 0) {
    const { data: updateArticles } = await supabase
      .from("learning_articles")
      .select("id, title, slug, summary")
      .in("id", updateIds)
      .is("tenant_id", null)
      .eq("status", "published")
      .eq("is_internal", false);
    const byId = new Map((updateArticles ?? []).map((a) => [a.id, a]));
    out.platform_updates = {
      ...out.platform_updates,
      articles: updateIds.map((id) => byId.get(id)).filter(Boolean) as LearnHomePayload["platform_updates"]["articles"],
    };
  }

  return out;
}
