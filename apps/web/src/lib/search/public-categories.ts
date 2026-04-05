import { getSupabaseServer } from "@/lib/supabase/server";
import type { Category } from "@/types/beautonomi";

/**
 * Same dataset as GET /api/public/categories — used to hydrate search filters on the server.
 */
export async function getPublicSearchCategories(): Promise<Category[]> {
  try {
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase
      .from("global_service_categories")
      .select(
        `
        id,
        slug,
        name,
        description,
        icon,
        is_active,
        created_at,
        updated_at,
        subcategories (
          id,
          category_id,
          slug,
          name,
          description,
          is_active
        )
      `
      )
      .eq("is_active", true)
      .order("name");

    if (error) {
      console.error("getPublicSearchCategories:", error);
      return [];
    }

    const rows = data ?? [];
    return rows.map((c) => ({
      ...c,
      subcategories: Array.isArray(c.subcategories) ? c.subcategories : [],
    })) as Category[];
  } catch (e) {
    console.error("getPublicSearchCategories:", e);
    return [];
  }
}
