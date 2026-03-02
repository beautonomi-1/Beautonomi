import { MetadataRoute } from "next";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://beautonomi.com";
  
  // Static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/become-a-partner`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/resources`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/help`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
  ];

  try {
    const supabase = await getSupabaseServer();
    
    // Fetch categories
    const { data: categories } = await supabase
      .from("global_service_categories")
      .select("slug, updated_at")
      .eq("is_active", true)
      .limit(100);

    const categoryRoutes: MetadataRoute.Sitemap =
      categories?.map((category) => ({
        url: `${baseUrl}/category/${category.slug}`,
        lastModified: category.updated_at ? new Date(category.updated_at) : new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })) || [];

    // Fetch active providers that have include_in_search_engines enabled
    // We need to join with users table to check the privacy setting
    // First, get all active providers with their user_id
    const { data: allProviders } = await supabase
      .from("providers")
      .select("slug, updated_at, user_id")
      .eq("status", "active")
      .limit(1000);

    if (!allProviders || allProviders.length === 0) {
      return [...staticRoutes, ...categoryRoutes];
    }

    // Get user IDs and fetch their include_in_search_engines setting
    const userIds = Array.from(new Set(allProviders.map(p => p.user_id).filter(Boolean)));
    
    if (userIds.length === 0) {
      return [...staticRoutes, ...categoryRoutes];
    }

    const { data: users } = await supabase
      .from("users")
      .select("id, include_in_search_engines")
      .in("id", userIds)
      .eq("include_in_search_engines", true);

    // Create a set of user IDs that have include_in_search_engines enabled
    const allowedUserIds = new Set(users?.map(u => u.id) || []);

    // Filter providers to only those whose users have include_in_search_engines enabled
    const providers = allProviders.filter(p => p.user_id && allowedUserIds.has(p.user_id));

    const providerRoutes: MetadataRoute.Sitemap =
      providers?.map((provider) => ({
        url: `${baseUrl}/partner-profile?slug=${encodeURIComponent(provider.slug)}`,
        lastModified: provider.updated_at ? new Date(provider.updated_at) : new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })) || [];

    return [...staticRoutes, ...categoryRoutes, ...providerRoutes];
  } catch (error) {
    console.error("Error generating sitemap:", error);
    // Return static routes if database fetch fails
    return staticRoutes;
  }
}
