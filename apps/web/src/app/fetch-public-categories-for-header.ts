import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getGlobalCategories } from "@/app/api/public/categories/global/route";

export type HeaderGlobalCategory = {
  id: string;
  name: string;
  slug: string;
  icon?: string;
};

/**
 * In-process categories for the marketplace header (no client round-trip).
 * Uses the same handler as GET /api/public/categories/global?all=true.
 */
export async function fetchPublicCategoriesForHeader(): Promise<HeaderGlobalCategory[]> {
  try {
    const req = await createNextRequestFromHeaders(
      "/api/public/categories/global?all=true",
    );
    const res = await getGlobalCategories(req);
    const json = (await res.json()) as { data?: unknown };
    const rows = json?.data;
    if (!Array.isArray(rows)) return [];
    return rows.map((cat: Record<string, unknown>) => ({
      id: String(cat.id ?? ""),
      name: String(cat.name ?? ""),
      slug: String(cat.slug ?? ""),
      icon: cat.icon != null ? String(cat.icon) : "BeautonomiAll",
    }));
  } catch (e) {
    console.warn("fetchPublicCategoriesForHeader failed:", e);
    return [];
  }
}
