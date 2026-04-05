import BeautonomiHeader from "@/components/layout/beautonomi-header";
import { fetchPublicCategoriesForHeader } from "./fetch-public-categories-for-header";

/**
 * Resolves separately from home listings so the shell can stream while /api/public/home runs.
 */
export default async function HomeMarketplaceHeader() {
  const rows = await fetchPublicCategoriesForHeader();
  const initial =
    rows.length > 0
      ? rows.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          icon: c.icon || "BeautonomiAll",
        }))
      : undefined;

  return <BeautonomiHeader initialGlobalCategories={initial} />;
}
