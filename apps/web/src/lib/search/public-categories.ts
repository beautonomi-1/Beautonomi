import { getSupabasePublicAnon } from "@/lib/supabase/public-anon";
import type { Category } from "@/types/beautonomi";

/**
 * Same dataset as GET /api/public/categories — used to hydrate search filters on the server.
 */
export async function getPublicSearchCategories(): Promise<Category[]> {
  try {
    const supabase = getSupabasePublicAnon();
    const selectWithI18n = `
        id,
        slug,
        name,
        description,
        icon,
        name_i18n,
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
      `;
    const selectLegacy = `
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
      `;

    let { data, error } = await supabase
      .from("global_service_categories")
      .select(selectWithI18n)
      .eq("is_active", true)
      .order("name");

    if (error && /name_i18n/i.test(error.message ?? "")) {
      const retry = await supabase
        .from("global_service_categories")
        .select(selectLegacy)
        .eq("is_active", true)
        .order("name");
      data = (retry.data ?? []).map((row) => ({
        ...row,
        name_i18n: null,
      }));
      error = retry.error;
    }

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
